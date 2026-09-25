import { capitalClient } from '../packages/sdk/dist/index.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Contract, ContractFactory, JsonRpcProvider, JsonRpcSigner, AbiCoder, keccak256, ZeroAddress, id, parseEther } from 'ethers';

// Fork-only: no private keys, no transaction is submitted to the public endpoint.
const manifest=JSON.parse(await readFile(new URL('../deployments/sepolia.json',import.meta.url),'utf8'));
const artifacts=resolve(process.env.ACT_CONTRACT_ARTIFACTS ?? new URL('../contracts/out/',import.meta.url).pathname);
const artifact=async name=>JSON.parse(await readFile(join(artifacts,`${name}.sol`,`${name}.json`),'utf8'));
const remote=new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
assert.equal((await remote.getNetwork()).chainId,11155111n);
const forkBlock=await remote.getBlockNumber();remote.destroy();
const reserve=createServer();await new Promise(ok=>reserve.listen(0,'127.0.0.1',ok));const port=reserve.address().port;await new Promise(ok=>reserve.close(ok));
const anvil=spawn(process.env.ACT_ANVIL_BIN ?? join(homedir(),'.agent-capital-tree/tools/foundry-v1.8.3/anvil'),['--port',String(port),'--chain-id','11155111','--fork-url','https://ethereum-sepolia.publicnode.com','--fork-block-number',String(forkBlock),'--silent'],{stdio:'ignore'});
let startupError;anvil.on('error',error=>startupError=error);
const rpc=new JsonRpcProvider(`http://127.0.0.1:${port}`,11155111,{staticNetwork:true,cacheTimeout:-1});
const evidence={network:'disposable Sepolia fork',forkBlock,gas:{}};
console.log(JSON.stringify({mode:'read-only public fork; all writes stay on localhost',forkBlock}));
try{
  let ready=false;for(let i=0;i<150;i++){if(startupError||anvil.exitCode!==null)throw new Error('Anvil fork failed');try{await rpc.getBlockNumber();ready=true;break;}catch{await delay(200);}}
  assert.ok(ready,'fork startup');
  await rpc.send('anvil_impersonateAccount',[manifest.deployer]);
  await rpc.send('anvil_setBalance',[manifest.deployer,'0x56bc75e2d63100000']);
  const owner=new JsonRpcSigner(rpc,manifest.deployer);
  async function deploy(name,args){const a=await artifact(name);const c=await new ContractFactory(a.abi,a.bytecode.object,owner).deploy(...args);const r=await c.deploymentTransaction().wait();assert.equal(r.status,1);evidence.gas[`deploy_${name}`]=r.gasUsed.toString();console.log(JSON.stringify({stage:`deploy_${name}`,gas:r.gasUsed.toString()}));return c;}
  async function write(name,c,fn,args){const tx=await c[fn](...args);const r=await tx.wait();assert.equal(r.status,1);evidence.gas[name]=r.gasUsed.toString();console.log(JSON.stringify({stage:name,gas:r.gasUsed.toString()}));return r;}
  const tokens=manifest.tokens.map(t=>t.address);
  const poolManager='0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',positionManager='0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4',permit2='0x000000000022D473030F116dDEE9F6B43aC78BA3';
  const vf=await deploy('VaultFactory',[poolManager,positionManager,permit2,tokens]);
  const nf=await deploy('NodeFactory',[await vf.getAddress()]);
  const labelData=JSON.parse(await readFile(new URL('../contracts/lib/ens-contracts-v2/contracts/deployments/sepolia/LabelStore.json',import.meta.url),'utf8'));
  const poolId=keccak256(AbiCoder.defaultAbiCoder().encode(['address','address','uint24','int24','address'],[...tokens,3000,60,ZeroAddress]));
  const controller=await deploy('CapitalController',[manifest.ensNamespace.registry,labelData.address,await nf.getAddress(),tokens,'agentcapitaltree',poolId]);
  const registry=new Contract(manifest.ensNamespace.registry,['function setSubregistry(uint256,address)'],owner);
  await write('attach_namespace',registry,'setSubregistry',[BigInt(manifest.ensNamespace.resource),await controller.PROJECT_REGISTRY()]);
  const manager=new Contract(poolManager,['function initialize((address,address,uint24,int24,address),uint160) returns(int24)','function extsload(bytes32) view returns(bytes32)'],owner);
  const poolSlot=keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32','uint256'],[poolId,6]));
  if((BigInt(await manager.extsload(poolSlot)) & ((1n<<160n)-1n))===0n) await write('initialize',manager,'initialize',[[...tokens,3000,60,ZeroAddress],1n<<96n]);
  const latest=await rpc.getBlock('latest');
  const all=[40n,44n,48n,52n,56n,60n,64n].reduce((mask,bit)=>mask|(1n<<bit),0n);
  const policy={capabilities:all,maxAmounts:[parseEther('100'),parseEther('100')],expiry:latest.timestamp+86400,tokenMask:3,poolId};
  const created=await write('create_root',controller,'createRoot',['fork-verification',policy]);
  const log=created.logs.map(l=>{try{return controller.interface.parseLog(l);}catch{return null;}}).find(l=>l?.name==='NodeCreated');
  const rootId=log.args.rootId;
  await write('operator',controller,'setRootOperator',[rootId,manifest.deployer,policy]);
  for(let i=0;i<2;i++){const token=new Contract(tokens[i],['function mint()','function claimed(address) view returns(bool)','function approve(address,uint256) returns(bool)'],owner);if(!await token.claimed(manifest.deployer)) await write(`mint${i}`,token,'mint',[]);await write(`approve${i}`,token,'approve',[await controller.getAddress(),parseEther('100')]);}
  await write('fund',controller,'fundRoot',[rootId,[parseEther('100'),parseEther('100')]]);
  const childAddress='0x000000000000000000000000000000000000A123';
  const childPolicy={...policy,maxAmounts:[parseEther('10'),parseEther('10')]};
  await write('spawn_child',controller,'spawnChild',[rootId,'child',childAddress,childPolicy,[parseEther('10'),parseEther('10')],id('fork-child')]);
  const childId=(await controller.getOperation(rootId,rootId,1,id('fork-child'))).nodeId;
  await rpc.send('anvil_impersonateAccount',[childAddress]);await rpc.send('anvil_setBalance',[childAddress,'0x56bc75e2d63100000']);
  const childController=controller.connect(new JsonRpcSigner(rpc,childAddress));
  await write('spawn_grandchild',childController,'spawnChild',[childId,'grandchild','0x000000000000000000000000000000000000A124',{...childPolicy,maxAmounts:[parseEther('1'),parseEther('1')]},[parseEther('1'),parseEther('1')],id('fork-grandchild')]);
  const deadline=latest.timestamp+3600;
  await write('open_lp',controller,'openPosition',[rootId,parseEther('1000'),[parseEther('50'),parseEther('50')],deadline]);
  await write('increase_lp',controller,'increasePosition',[rootId,parseEther('100'),[parseEther('10'),parseEther('10')],deadline]);
  await write('swap',childController,'swap',[childId,true,parseEther('1'),parseEther('0.9'),4295128740n,deadline]);
  await write('collect_fees',controller,'collectFees',[rootId,[1,0],deadline]);
  const node=await controller.getNode(rootId);const vault=new Contract(node.vault,['function positionLiquidity() view returns(uint128)'],rpc);
  assert.equal(await vault.positionLiquidity(),parseEther('1100'));
  const sdk=capitalClient(`http://127.0.0.1:${port}`,await controller.getAddress());
  const before=await sdk.getTree(rootId);
  assert.equal(before.nodes[0].position.liquidity,parseEther('1100'));
  assert.equal(before.nodes[1].authorizedCapabilities,all);
  assert.equal(before.nodes[2].position.tokenId,0n);
  await write('owner_close',controller,'ownerEmergencyClosePosition',[rootId,[0,0],deadline]);
  await assert.rejects(controller.openPosition.staticCall(rootId,1,[1,1],deadline));
  const after=await sdk.getTree(rootId);
  assert.ok(after.nodes.every(node=>node.authorizedCapabilities===0n));
  assert.equal(after.nodes[0].position.tokenId,0n);
  for(const node of [...after.nodes].reverse()) await write(`owner_recover_${node.id}`,controller,'ownerEmergencyRecover',[node.id]);
  const recovered=await sdk.getTree(rootId);
  assert.deepEqual(recovered.totalBalances,[0n,0n]);
  evidence.result='passed';console.log(JSON.stringify(evidence));
}finally{rpc.destroy();anvil.kill('SIGTERM');}
