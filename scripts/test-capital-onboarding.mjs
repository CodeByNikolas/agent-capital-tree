#!/usr/bin/env node
// Root #4 on the explicit historical controller ONLY. Never rerun seed/payment/worker runners.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const flags = process.argv.slice(2);
assert.ok(flags.every(flag => ['--prepare-recovery','--execute-demo','--open-browser'].includes(flag)));
assert.ok(!(flags.includes('--prepare-recovery') && flags.includes('--execute-demo')));
const root = 'root-agent.agentcapitalusdc.eth', controller = '0x17a932987f3cAcFec067c4C1bbE6946963d87F13';
const owner = '0x4E09c220BD556396Bc255A4DD24F858Bafeba6f5', vault = '0xC9c7926191b7928F838579D74CdA380A66A8CD9A';
const usdc = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const client = new Client({name:'root-4-onboarding-proof',version:'2'});
const transport = new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../packages/runtime/capital.mjs',import.meta.url)),
  'stdio','hello.agentcapitalusdc.eth','--deployment','usdc-full-vaults', ...(flags.includes('--execute-demo') ? ['--enable-sepolia-writes'] : [])],stderr:'pipe'});
const report = { observedAt:new Date().toISOString(), controller, root, transactions:[], worker:'not_requested', publicWritesRequested:flags.includes('--execute-demo') };
const artifacts = new URL('../artifacts/ui/',import.meta.url);
const timer = setTimeout(()=>{console.error('Onboarding test timed out; reconcile original operation keys.');process.exit(1);},flags.includes('--execute-demo')?600000:180000);
async function call(name,args,errorPattern) {
  const result = await client.callTool({name,arguments:args},undefined,{timeout:180000});
  const png = result.content.find(item=>item.type==='image'); assert.equal(png?.mimeType,'image/png');
  if (errorPattern) {assert.equal(result.isError,true);assert.match(result.content[0].text,errorPattern);return;}
  assert.equal(result.isError,undefined,result.content[0].text);
  return { data:JSON.parse(result.content[0].text), png:Buffer.from(png.data,'base64'), links:result.content[1].text };
}
try {
  await mkdir(artifacts,{recursive:true}); await client.connect(transport,{timeout:60000});
  assert.equal((await client.listTools()).tools.length,23);
  for (const budgetRaw of ['5000000','500000']) await call('getCapitalSetup',{budgetRaw},/100000.*0\.10.*NOT an on-chain/);
  const viewed = await call('getTree',{query:root}); assert.equal(viewed.data.rootId,'4'); assert.equal(viewed.data.mcp.activeMcpRootId,'3');
  const selected = await call('selectCapitalRoot',{query:root}); assert.equal(selected.data.activeMcpRootId,'4'); assert.equal(selected.data.controller.toLowerCase(),controller.toLowerCase());
  const before = await call('getTree',{query:vault});
  assert.equal(before.data.owner.toLowerCase(),owner.toLowerCase()); assert.equal(before.data.source.chainId,11155111);
  assert.deepEqual(before.data.mcp.source,before.data.source);
  assert.equal(before.data.totalBalances[0],'100000','Do not add funds or use another root to force the demo.');
  await call('selectCapitalRoot',{query:'not-created-onboarding-proof.agentcapitalusdc.eth'},/ROOT_NOT_FOUND/);
  assert.equal((await call('getCapitalSetup',{})).data.activeMcpRootId,'4','Failed selection must preserve scope.');
  if (flags.includes('--prepare-recovery')) {
    const setup = await call('prepareOperatorRecovery',{expectedRootId:'4',expectedBoundOperator:owner,budgetRaw:'100000',openBrowser:flags.includes('--open-browser')});
    assert.equal(setup.data.walletActions.some(a=>a.action==='fund-shortfall'),false);
    report.setup=setup.data;
    await writeFile(new URL('root-4-wallet-handoff.png',artifacts),setup.png);
    console.log(JSON.stringify({localOperator:setup.data.localOperator,walletActions:setup.data.walletActions,transactionSubmitted:false}));
  }
  if (flags.includes('--execute-demo')) {
    const ready=(await call('getCapitalSetup',{})).data;
    assert.equal(ready.writeReady,true,'Owner authorization and local signer gas are required.');
    assert.notEqual(ready.localOperator.toLowerCase(),owner.toLowerCase(),'Do not import the owner key.');
    for (const node of before.data.nodes.filter(n=>n.parentId!=='0')) assert.ok(['test-agent-1','test-agent-2'].includes(node.label),'Unexpected child: review before continuing.');
    for (const name of ['test-agent-1','test-agent-2']) {
      const operationKey=`0x${createHash('sha256').update(`act:11155111:${controller.toLowerCase()}:4:20260926:${name}:20000:v1`).digest('hex')}`;
      const args={expectedRootId:'4',operationKey,name,asset:usdc,amount:'20000',restrictions:{capabilities:['delegate'],allowedAssets:[usdc],maxPerAction:{[usdc]:'20000'}}};
      await call('createChildVault',{...args,expectedRootId:'3'},/WRONG_TARGET_ROOT/);
      const first=(await call('createChildVault',args)).data;
      assert.equal(first.dispatchStatus,'not_requested');
      const repeated=(await call('createChildVault',args)).data;
      assert.equal(repeated.childId,first.childId);
      report.transactions.push({name,operationKey,...first,repeatedChildId:repeated.childId});
      // Save partial public evidence immediately; never lose the first receipt if the second action fails.
      await writeFile(new URL('root-4-onboarding-report.json',artifacts),JSON.stringify(report,null,2));
    }
  }
  const final=await call('getTree',{query:root}); report.tree=final.data;
  if (flags.includes('--execute-demo')) {
    assert.equal(final.data.nodes.length,3);assert.equal(final.data.totalBalances[0],'100000');
    assert.equal(final.data.nodes.find(n=>n.id==='4').balances[0],'60000');
    for (const name of ['test-agent-1','test-agent-2']) {
      const node=final.data.nodes.find(n=>n.label===name);assert.equal(node.parentId,'4');assert.equal(node.rootId,'4');assert.equal(node.balances[0],'20000');
    }
  }
  await writeFile(new URL('root-4-demo-tree.png',artifacts),final.png);
  await writeFile(new URL('root-4-onboarding-report.json',artifacts),JSON.stringify(report,null,2));
  console.log(JSON.stringify({rootId:final.data.rootId,block:final.data.source.blockNumber,total:final.data.totalBalances[0],nodes:final.data.nodes.length,controller,writes:report.transactions.length,writeReady:final.data.mcp.writeReady,images:'PNG',worker:'not_requested'}));
} finally {clearTimeout(timer);await client.close();}
