import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { JsonRpcProvider, HDNodeWallet, parseEther } from 'ethers';
import { journaledTransaction } from './lib/sepolia-transactions.mjs';

const reserve=createServer();await new Promise(ok=>reserve.listen(0,'127.0.0.1',ok));const port=reserve.address().port;await new Promise(ok=>reserve.close(ok));
const directory=await mkdtemp(join(tmpdir(),'act-journal-test-'));
const anvil=spawn(process.env.ACT_ANVIL_BIN ?? join(homedir(),'.agent-capital-tree/tools/foundry-v1.8.3/anvil'),['--port',String(port),'--chain-id','11155111','--silent'],{stdio:'ignore'});
const rpc=new JsonRpcProvider(`http://127.0.0.1:${port}`,11155111,{staticNetwork:true,cacheTimeout:-1});
let startupError;anvil.on('error',error=>startupError=error);
try {
  for(let i=0;i<40;i++){if(startupError)throw startupError;try {await rpc.getBlockNumber();break;}catch {await delay(100);}}
  // Anvil's public synthetic mnemonic. Never use these accounts on any public chain.
  const signer=HDNodeWallet.fromPhrase('test test test test test test test test test test test junk').connect(rpc);
  const receiver='0x0000000000000000000000000000000000001234';
  const request={to:receiver,value:parseEther('0.001')};
  let failOnce=true;
  const interrupted=new Proxy(rpc,{get(target,key){
    if(key==='broadcastTransaction') return async raw=>{const result=await target.broadcastTransaction(raw);if(failOnce){failOnce=false;throw new Error('synthetic lost response');}return result;};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  const args={rpc:interrupted,signer,directory,name:'transfer',request,confirmations:1};
  await assert.rejects(journaledTransaction(args),/lost response/);
  const recovered=await journaledTransaction(args);
  const duplicate=await journaledTransaction({...args,rpc});
  assert.equal(recovered.receipt.hash,duplicate.receipt.hash);
  assert.equal(await rpc.getBalance(receiver),parseEther('0.001'));
  await assert.rejects(journaledTransaction({...args,request:{...request,value:parseEther('0.002')}}),/differs/);
  await assert.rejects(journaledTransaction({...args,name:'../escape'}),/Invalid journal name/);
  console.log('Transaction journal: lost response recovered, one payment, conflicting retry rejected.');
} finally {rpc.destroy();anvil.kill('SIGTERM');await rm(directory,{recursive:true,force:true});}
