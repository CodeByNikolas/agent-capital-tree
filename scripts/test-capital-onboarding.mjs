#!/usr/bin/env node
// Uses production onboarding and operation mechanisms; never replays historical root 4.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { demoBudgetSchema } from '../packages/plugin/demo-budget.mjs';
const args=process.argv.slice(2);
const value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
const budgetRaw=demoBudgetSchema.parse(value('--limit-raw'));
const fundingRaw=demoBudgetSchema.parse(value('--funding-raw'));
const amount=demoBudgetSchema.parse(value('--child-raw'));
if(!args.includes('--user-confirmed')||BigInt(amount)>BigInt(fundingRaw)||BigInt(fundingRaw)>BigInt(budgetRaw)) throw new Error('Explicit user-confirmed shared limit, funding and child allocation required. No defaults.');
const prepareOnly=args.includes('--prepare-only');
const client=new Client({name:'kanoki-saved-onboarding-test',version:'3'});
async function call(name,input){
  const result=await client.callTool({name,arguments:input},undefined,{timeout:180000});
  console.log(result.structuredContent?._kanoki?.imageLinks?.join('\n')??'');
  if(result.isError)throw new Error(result.content.find(item=>item.type==='text')?.text??'Tool failed');
  const data={...result.structuredContent};delete data._kanoki;return data;
}
try {
  await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../packages/runtime/capital.mjs',import.meta.url)),'stdio',...(prepareOnly?[]:['--enable-sepolia-writes'])],stderr:'pipe'}));
  const prepared=await call('prepareRootSetup',{budgetRaw,fundingRaw,userConfirmedLimit:true,openBrowser:false});
  const asset='0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const operationKey=`0x${createHash('sha256').update(`kanoki:${prepared.setupId}:${amount}:child-test-v1`).digest('hex')}`;
  const setup=await call('prepareRootSetup',{budgetRaw,fundingRaw,userConfirmedLimit:true,openBrowser:!prepareOnly,test:{operationKey,name:'kanoki-test-child',asset,amount,restrictions:{capabilities:['delegate'],allowedAssets:[asset],maxPerAction:{[asset]:'0'}}}});
  if(prepareOnly||setup.status==='blocked'){
    console.log(JSON.stringify({setupId:setup.setupId,status:setup.status??'prepared',next:setup.next,transactionSubmitted:false}));
    if(setup.status==='blocked')process.exitCode=2;
  }else{
    const end=Date.now()+15*60*1000;let result;
    do{result=await call('continueCapitalSetup',{waitSeconds:20});if(result.status==='confirmed'||result.status==='blocked')break;}while(Date.now()<end);
    if(result.status!=='confirmed')throw new Error('Setup remains pending. Resume this same command; no replacement operation is generated.');
    const repeat=await call('continueCapitalSetup',{waitSeconds:0});
    if(repeat.childId!==result.childId)throw new Error('Repeated operation returned a different child');
    const tree=await call('getTree',{rootId:result.activeMcpRootId});
    await writeFile(new URL('../artifacts/ui/kanoki-onboarding-e2e.json',import.meta.url),JSON.stringify({observedAt:new Date().toISOString(),budgetRaw,fundingRaw,amount,operationKey,result,tree,repeatChildId:repeat.childId},null,2));
    console.log(JSON.stringify({status:'confirmed',transactionHash:result.transactionHash,block:result.blockNumber,rootId:tree.rootId,childId:result.childId,totalBalances:tree.totalBalances,worker:'not_requested'}));
  }
}finally{await client.close();}
