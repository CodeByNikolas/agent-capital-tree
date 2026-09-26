// Exercise the real wallet adapter with deterministic wallet/RPC boundaries; no public writes.
import assert from 'node:assert/strict';
import { build } from '../packages/plugin/node_modules/esbuild/lib/main.js';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const output = new URL('../apps/web/.onboarding-test.mjs', import.meta.url);
const viem = fileURLToPath(new URL('../packages/runtime/node_modules/viem/_esm/index.js', import.meta.url)).replaceAll('\\','/');
const compiled = await build({ entryPoints: [fileURLToPath(new URL('../apps/web/src/lib/use-wallet-actions.ts',import.meta.url))], bundle:true, platform:'node',format:'esm',write:false,
  plugins:[{name:'controlled-wallet',setup(b){
    b.onResolve({filter:/^(react|viem)$/},args=>({path:args.path,namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='react'
      ? 'export const useRef = value => ({current:value}); export const useState = value => [value, () => {}];'
      : `export * from ${JSON.stringify(viem)}; export const createPublicClient=()=>globalThis.testRpc; export const createWalletClient=()=>globalThis.testWallet;`,resolveDir:fileURLToPath(new URL('..',import.meta.url))}));
  }}] });
await writeFile(output,compiled.outputFiles[0].text);
try {
  const {useWalletActions}=await import(output.href);
  const owner=`0x${'2'.repeat(40)}`, operator=`0x${'3'.repeat(40)}`, controller=`0x${'1'.repeat(40)}`, vault=`0x${'4'.repeat(40)}`, token=`0x${'5'.repeat(40)}`, zero=`0x${'0'.repeat(40)}`;
  const draft={permissions:['delegate','restrict','reclaim'],allowedTokens:[true,false],maxAmounts:['0.1','0'],expiresAt:'2027-01-01',poolId:`0x${'0'.repeat(64)}`};
  function fixture() {
    const storage=new Map(); globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
    globalThis.window={ethereum:{}};
    const state={root:null,bound:zero,balance:0n,gas:0n,allowance:0n,sends:[],failReceipt:false,unknownSend:false};
    globalThis.testRpc={getCode:async()=> '0x1234', getBlockNumber:async()=> 42n, estimateGas:async()=>21000n,getBalance:async()=>state.gas,
      waitForTransactionReceipt:async()=>{if(state.failReceipt){state.failReceipt=false;throw new Error('RPC unavailable');}return {status:'success'};},
      simulateContract:async request=>({request}),
      readContract:async({functionName,args})=>{
        switch(functionName){
          case 'decimals':return 6; case 'nextNodeId':return state.root?2n:1n;
          case 'getNode':return state.root; case 'rootOwner':return owner; case 'rootOperator':return state.bound;
          case 'getRootNodeIds':return [1n];case 'balanceOf':return state.balance;case 'allowance':return state.allowance;
          default:throw new Error(`Unexpected read ${functionName}`);
        }
      }};
    const hash=()=>`0x${String(state.sends.length).padStart(64,'0')}`;
    globalThis.testWallet={getChainId:async()=>11155111,getAddresses:async()=>[owner],
      writeContract:async({functionName,args})=>{
        state.sends.push(functionName);
        if(state.unknownSend) throw new Error('Unknown wallet outcome');
        if(functionName==='createRoot')state.root={id:1n,parentId:0n,label:args[0],vault,policy:args[1],revoked:false};
        if(functionName==='setRootOperator')state.bound=args[1];
        if(functionName==='approve')state.allowance=args[1];
        if(functionName==='fundRoot')state.balance+=args[1][0];
        return hash();
      },sendTransaction:async({value})=>{state.sends.push('gas');state.gas+=value;return hash();}};
    const restart=()=>useWalletActions({data:{},deployment:{contractsConfigured:true,controllerAddress:controller,tokenAddresses:[token,controller]},address:owner,chainId:11155111,onConfirmed(){}}).actions;
    return {state,restart};
  }
  const first=fixture();
  assert.equal(await first.restart().completeRootSetup('kanoki-test',operator,'100000',draft),vault);
  assert.deepEqual(first.state.sends,['createRoot','setRootOperator','approve','fundRoot','gas']);
  first.state.balance=60000n; first.state.gas=1n;
  await first.restart().completeRootSetup('kanoki-test',operator,'100000',draft);
  assert.equal(first.state.sends.length,5,'Completed setup must not refill funds or gas after later usage');
  const paused=fixture(); paused.state.failReceipt=true;
  await assert.rejects(paused.restart().completeRootSetup('kanoki-test',operator,'100000',draft),/RPC unavailable/);
  await paused.restart().completeRootSetup('kanoki-test',operator,'100000',draft);
  assert.equal(paused.state.sends.filter(x=>x==='createRoot').length,1,'Resume reconciles the prior creation');
  const unknown=fixture();unknown.state.unknownSend=true;
  await assert.rejects(unknown.restart().completeRootSetup('kanoki-test',operator,'100000',draft),/Unknown wallet outcome/);
  await assert.rejects(unknown.restart().completeRootSetup('kanoki-test',operator,'100000',draft),/unknown outcome/);
  assert.equal(unknown.state.sends.length,1,'Unknown broadcast must never be retried automatically');
  const mismatched=fixture();mismatched.state.root={id:1n,parentId:0n,label:'kanoki-test',vault,policy:{},revoked:false};mismatched.state.bound=controller;
  await assert.rejects(mismatched.restart().completeRootSetup('kanoki-test',operator,'100000',draft),/different operator/);
  assert.equal(mismatched.state.sends.length,0);
  console.log('PASS: guided setup, restart reconciliation, no repeat funding, uncertain-send lockout and operator protection. No chain writes.');
} finally {await unlink(output);}
