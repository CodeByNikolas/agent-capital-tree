import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { toolView, toolAsSvg } from '../tool-visual.mjs';
import { dashboardTokens } from '../dashboard-theme.mjs';
import { financeRoles } from '../../sdk/dist/policy.js';
import { browserCommand, openWalletBrowser } from '../../../scripts/open-wallet-browser.mjs';

const address='0x'+'a'.repeat(40), key='0x'+'1'.repeat(64);
const tree={rootId:'1',generation:'1',source:{chainId:11155111,blockNumber:'42',timestamp:'100',observedAt:'2026-09-26T00:00:00Z'},nodes:[
  {id:'1',parentId:'0',generation:'1',revoked:false,ensName:'demo.agentcapitalusdc.eth',vault:address,balances:['100000','0'],effectivePolicy:{expiry:'200'},authorizedActions:['delegate']}
]};
const strategy={nodeId:'1',maxAmount0:'1',maxAmount1:'1',liquidity:'1',deadline:1800000000};
const requests={
  getTree:{rootId:'1'},getEffectivePolicy:{nodeId:'1'},getCapitalActivity:{rootId:'1'},getOperationStatus:{operationKey:key},
  spawnChild:{operationKey:key,task:'Read only',model:'m',asset:address,amount:'1',restrictions:{}},getPaymentServices:{},
  createChildVault:{operationKey:key,name:'researcher',asset:address,amount:'1',restrictions:{}},
  purchaseService:{operationKey:key,serviceId:'demo',maxAmount:'1'},allocateCapital:{childId:'2',asset:address,amount:'1'},
  tightenPolicy:{nodeId:'2',restrictions:{}},swap:{nodeId:'1',tokenIn:address,amountIn:'1',minAmountOut:'0',deadline:1800000000},
  openPosition:strategy,increasePosition:strategy,collectFees:{nodeId:'1',deadline:1800000000},
  closePosition:{nodeId:'1',minAmount0Out:'0',minAmount1Out:'0',deadline:1800000000},revokeSubtree:{nodeId:'2'},reclaimAssets:{nodeId:'2'}
};
function png(result) {
  assert.match(result.content[1].text,/Mermaid fallback/);
  const images=result.content.filter(item=>item.type==='image');
  assert.ok(images.length);
  for(const image of images) {
    assert.equal(image.mimeType,'image/png');
    const bytes=Buffer.from(image.data,'base64');
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.ok(bytes.length>10_000,'Fonts and content must render, not just an empty card');
  }
}

test('all tools return PNG on success, backend failure and invalid input; invalid input never executes',async()=>{
  let reject=false,calls=0;
  const runtime=createServer((req,res)=>{
    calls++;
    const name=req.url.split('/').pop();
    res.writeHead(reject?409:200,{'content-type':'application/json'});
    res.end(JSON.stringify(reject?{error:'secret-provider-value'}:name==='getTree'?tree:{status:'confirmed',transactionHash:key,blockNumber:'42'}));
  });
  await new Promise(resolve=>runtime.listen(0,'127.0.0.1',resolve));
  const client=new Client({name:'visual-contract',version:'1'});
  try {
    await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../bundle/server.mjs',import.meta.url))],
      env:{PATH:process.env.PATH??'',ACT_RUNTIME_URL:`http://127.0.0.1:${runtime.address().port}`,ACT_MCP_TOKEN:'test-token'}}));
    const listed=await client.listTools();
    assert.equal(listed.tools.length,Object.keys(requests).length);
    for(const spec of listed.tools) assert.ok(spec.description.length > 0);
    for(const [name,args] of Object.entries(requests)) {
      const success=await client.callTool({name,arguments:args});
      assert.equal(success.isError,undefined,success.content[0].text);png(success);
      reject=true;
      const failure=await client.callTool({name,arguments:args});
      assert.equal(failure.isError,true);png(failure);assert.doesNotMatch(failure.content[0].text,/secret-provider-value/);
      reject=false;
      const before=calls,invalid=await client.callTool({name,arguments:{...args,agentId:'forged'}});
      assert.equal(invalid.isError,true);png(invalid);assert.equal(calls,before);
    }
    const unknown=await client.callTool({name:'unknown',arguments:{}});assert.equal(unknown.isError,true);png(unknown);
    assert.equal(calls,2*Object.keys(requests).length,'Rendering must not retry writes or issue extra RPC reads');
  } finally {await client.close();runtime.close();}
});

test('visuals match dashboard tokens and actual finance-role bits; uncertain writes stay uncertain',async()=>{
  const css=await readFile(new URL('../../../apps/web/src/app/tokens.css',import.meta.url),'utf8');
  for(const value of Object.values(dashboardTokens)) assert.ok(css.includes(value));
  const policy=toolView('getEffectivePolicy',{nodeId:'2'},{capabilities:String(financeRoles.pay|financeRoles.reclaim)},{readOnly:true});
  assert.equal(policy.rows.find(([key])=>key==='Policy capabilities')[1],'reclaim · pay');
  const uncertain=toolView('spawnChild',{},'Transport unavailable',{readOnly:false,isError:true});
  assert.equal(uncertain.status,'OUTCOME UNCONFIRMED');
  assert.match(uncertain.next,/Reconcile/);
  const view=toolView('spawnChild',{}, {childId:'2',dispatchStatus:'allocation_confirmed_dispatch_unknown'},{readOnly:false});
  assert.equal(view.status,'ALLOCATION CONFIRMED · WORKER UNKNOWN');
  assert.equal(toolView('createChildVault',{}, {dispatchStatus:'not_requested'},{readOnly:false}).status,'VAULT CONFIRMED · CHAT-MANAGED');
  assert.doesNotMatch(toolAsSvg({...view,rows:[['Test','<svg onload="bad">']]}),/<svg onload=/);
});

test('wallet handoff opens only the trusted URL in the normal browser and reports launch failure honestly',async()=>{
  const url='https://agent-capital-tree-silk.vercel.app/setup?action=create-root&label=demo&budget=100000';
  const win=browserCommand(url,'win32',{SystemRoot:'C:\\Windows'});
  assert.match(win.command,/rundll32\.exe$/);assert.deepEqual(win.args,['url.dll,FileProtocolHandler',url]);
  assert.deepEqual(browserCommand(url,'darwin',{}),{command:'/usr/bin/open',args:[url]});
  assert.equal(browserCommand(url,'linux',{WSL_DISTRO_NAME:'Ubuntu'}).command,'/mnt/c/Windows/System32/rundll32.exe');
  assert.throws(()=>browserCommand('https://evil.test/setup','win32',{}));
  assert.throws(()=>browserCommand('https://agent-capital-tree-silk.vercel.app/other','win32',{}));
  for(const code of [0,1]) {
    const result=await openWalletBrowser(url,(_command,args,options)=>{
      assert.equal(options.shell,false);assert.equal(args.at(-1),url);
      const child=new EventEmitter();queueMicrotask(()=>child.emit('exit',code));return child;
    });
    assert.equal(result.opened,code===0);assert.equal(result.walletDetected,false);
  }
});
