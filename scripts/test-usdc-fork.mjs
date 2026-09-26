import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {Contract,ContractFactory,JsonRpcProvider,JsonRpcSigner,Wallet,AbiCoder,keccak256,ZeroAddress,ZeroHash,id,TypedDataEncoder} from 'ethers';
import {createRequire} from 'node:module';
import {startX402DemoService} from './lib/x402-demo-service.mjs';
import {paymentHandler,signVaultPayment,transferAuthorizationTypes} from '../packages/runtime/dist/payments.js';
const require=createRequire(new URL('../packages/runtime/package.json',import.meta.url));
const {createPublicClient,createWalletClient,http,publicActions}=require('viem');
const {privateKeyToAccount}=require('viem/accounts');
const {sepolia}=require('viem/chains');
const {ExactEvmScheme}=require('@x402/evm/exact/facilitator');
const {toFacilitatorEvmSigner}=require('@x402/evm');
const testPayments=process.argv.includes('--payments');
import {capitalClient} from '../packages/sdk/dist/index.js';

// All deployment, namespace changes, impersonation and transfers occur on a disposable localhost fork.
// No private keys are read, no token balances/storage are overridden, and no public writes are possible.
const manifest=JSON.parse(await readFile(new URL('../deployments/sepolia.json',import.meta.url),'utf8'));
const usdc=JSON.parse(await readFile(new URL('../deployments/usdc-sepolia.json',import.meta.url),'utf8'));
const upstream='https://ethereum-sepolia.publicnode.com';
const remote=new JsonRpcProvider(upstream);
assert.equal((await remote.getNetwork()).chainId,11155111n);
const forkBlock=await remote.getBlockNumber();remote.destroy();
console.log(`Starting disposable Sepolia fork at ${forkBlock}`);
const reserve=createServer();await new Promise(ok=>reserve.listen(0,'127.0.0.1',ok));const port=reserve.address().port;await new Promise(ok=>reserve.close(ok));
const anvil=spawn(join(homedir(),'.agent-capital-tree/tools/foundry-v1.8.3/anvil'),['--port',String(port),'--chain-id','11155111','--fork-url',upstream,'--fork-block-number',String(forkBlock),'--silent'],{stdio:'ignore'});
let startupError;anvil.on('error',e=>startupError=e);
const rpcUrl=`http://127.0.0.1:${port}`;
const rpc=new JsonRpcProvider(rpcUrl,11155111,{staticNetwork:true,cacheTimeout:-1});
const transactions=[];
let seller, blockTimer, privateDirectory;
try{
 let ready=false;for(let i=0;i<150;i++){if(startupError||anvil.exitCode!==null)throw Error('Fork startup failed');try{await rpc.getBlockNumber();ready=true;break;}catch{await delay(200);}}assert(ready);
 const ownerAddress=manifest.deployer,donor=usdc.funding.owner;
 for(const a of [ownerAddress,donor]){await rpc.send('anvil_impersonateAccount',[a]);await rpc.send('anvil_setBalance',[a,'0x56bc75e2d63100000']);}
 const owner=new JsonRpcSigner(rpc,ownerAddress),donorSigner=new JsonRpcSigner(rpc,donor);
 const artifact=async name=>JSON.parse(await readFile(process.env.ACT_ARTIFACT_DIR ? join(process.env.ACT_ARTIFACT_DIR,`${name}.sol/${name}.json`) : new URL(`../contracts/out/${name}.sol/${name}.json`,import.meta.url),'utf8'));
 async function receipt(hash){for(let i=0;i<120;i++){const r=await rpc.getTransactionReceipt(hash);if(r){assert.equal(r.status,1);return r;}await delay(500);}throw Error(`Local receipt timeout: ${hash}`);}
 async function deploy(name,args){console.log(`Deploy ${name}`);const a=await artifact(name);const c=await new ContractFactory(a.abi,a.bytecode.object,owner).deploy(...args,{gasLimit:25_000_000});await receipt(c.deploymentTransaction().hash);return c;}
 async function write(name,c,method,args){console.log(name);const r=await receipt((await c[method](...args,{gasLimit:25_000_000})).hash);transactions.push({name,gas:r.gasUsed.toString()});return r;}
 const token=new Contract(usdc.token.address,['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function transfer(address,uint256) returns(bool)','function approve(address,uint256) returns(bool)'],donorSigner);
 assert.equal(await token.decimals(),6n);const original=await token.balanceOf(donor);assert(original>=10_000_000n);
 const tokens=[usdc.token.address,testPayments?usdc.tokens.find(t=>t.symbol==='DEMO-USD').address:manifest.tokens[1].address].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
 assert.equal(tokens[0],usdc.token.address);
 const {poolManager,positionManager,permit2}=manifest.uniswap;
 const vf=await deploy('VaultFactory',[poolManager,positionManager,permit2,tokens]);
 const nf=await deploy('NodeFactory',[await vf.getAddress()]);
 const label=JSON.parse(await readFile(new URL('../contracts/lib/ens-contracts-v2/contracts/deployments/sepolia/LabelStore.json',import.meta.url),'utf8'));
 const poolId=keccak256(AbiCoder.defaultAbiCoder().encode(['address','address','uint24','int24','address'],[...tokens,3000,60,ZeroAddress]));
 const controller=await deploy('CapitalController',[manifest.ensNamespace.registry,label.address,await nf.getAddress(),tokens,'agentcapitaltree',poolId]);
 const registry=new Contract(manifest.ensNamespace.registry,['function setSubregistry(uint256,address)'],owner);
 await write('fork-only-namespace-attachment',registry,'setSubregistry',[manifest.ensNamespace.resource,await controller.PROJECT_REGISTRY()]);
 await write('fork-only-test-funding',token,'transfer',[ownerAddress,10_000_000n]);
 const originalOwnerBalance=await token.balanceOf(ownerAddress)-10_000_000n;
 const now=(await rpc.getBlock('latest')).timestamp;
 const roles=(1n<<40n)|(1n<<60n)|(1n<<64n)|(testPayments?1n<<68n:0n);
 const policy={capabilities:roles|(testPayments?((1n<<44n)|(1n<<48n)|(1n<<52n)|(1n<<56n)):0n),maxAmounts:[10_000_000n,testPayments?1_000_000n:0n],expiry:now+3600,tokenMask:testPayments?3:1,poolId:testPayments?poolId:ZeroHash};
 await write('create-root',controller,'createRoot',['usdc-fork',policy]);
 await write('bind-operator',controller,'setRootOperator',[1,ownerAddress,policy]);
 await write('approve-usdc',token.connect(owner),'approve',[await controller.getAddress(),10_000_000n]);
 if(testPayments){const quote=new Contract(tokens[1],['function mint()','function approve(address,uint256) returns(bool)'],owner);await write('claim-demo-quote',quote,'mint',[]);await write('approve-demo-quote',quote,'approve',[await controller.getAddress(),1_000_000n]);}
 await write('fund-10-usdc',controller,'fundRoot',[1,[10_000_000n,testPayments?1_000_000n:0n]]);
 const childWallet=Wallet.createRandom();const child=childWallet.address;
 const childPolicy={...policy,maxAmounts:[2_000_000n,0n],tokenMask:1};
 await write('delegate-2-usdc',controller,'spawnChild',[1,'researcher',child,childPolicy,[2_000_000n,0n],id('usdc-fork-researcher')]);
 const rootNode=await controller.getNode(1),childNode=await controller.getNode(2);
 const implementation=await vf.IMPLEMENTATION();
 for(const node of [rootNode,childNode]){
   assert.equal((await rpc.getCode(node.vault)).toLowerCase(),`0x363d3d373d3d3d363d73${implementation.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`);
   const vault=new Contract(node.vault,['function CONTROLLER() view returns(address)','function initialize(address)'],owner);
   assert.equal(await vault.CONTROLLER(),await controller.getAddress());
   await assert.rejects(vault.initialize.staticCall(ownerAddress));
 }
 assert.equal(await token.balanceOf(rootNode.vault),8_000_000n);assert.equal(await token.balanceOf(childNode.vault),2_000_000n);
 const effective=await controller.getEffectivePolicy(2);assert.equal(effective.maxAmounts[0],2_000_000n);
 const tree=await capitalClient(rpcUrl,await controller.getAddress()).getTree(1n);
 assert.equal(tree.nodes[1].ensName,'researcher.usdc-fork.agentcapitaltree.eth');
 assert.equal(tree.totalBalances[0],10_000_000n);
 await assert.rejects(controller.checkAction(2,1n<<40n,child,0,2_000_001n));
 await assert.rejects(controller.checkAction(2,1n<<40n,ownerAddress,0,1n));
 if(testPayments){
   console.log('Test official x402 facilitator and worker purchase flow');
   privateDirectory=await mkdtemp(join(tmpdir(),'act-usdc-x402-'));
   // The facilitator spends only fork gas; the USDC authorization is signed by the child operator.
   const combined=createWalletClient({account:ownerAddress,chain:sepolia,transport:http(rpcUrl)}).extend(publicActions);
   const facilitator=new ExactEvmScheme(toFacilitatorEvmSigner({...combined,address:ownerAddress}),{simulateInSettle:true});
   seller=await startX402DemoService({facilitator,payTo:donor,allowedPayers:[childNode.vault],directory:join(privateDirectory,'seller')});
   const context={workerId:'fork-child',rootId:'1',nodeId:'2',authorityGeneration:childNode.generation.toString()};
   const config={rpcUrl,controller:await controller.getAddress(),directory:join(privateDirectory,'buyer'),services:[{id:'research',url:seller.url,payTo:donor,maxAmount:'10000'}],accountFor:async()=>privateKeyToAccount(childWallet.privateKey)};
   const purchase=paymentHandler(config);
   const args={serviceId:'research',maxAmount:'10000',operationKey:id('usdc-research-purchase')};
   blockTimer=setInterval(()=>{void rpc.send('evm_mine',[]).catch(()=>{});},1000);
   const currentTime=Number((await rpc.getBlock('latest')).timestamp);
   const actor=privateKeyToAccount(childWallet.privateKey);
   const approved=await signVaultPayment(actor,childNode.vault,childNode.generation,seller.requirement,BigInt(now+3600),currentTime);
   const vaultVerifier=new Contract(childNode.vault,['function isValidSignature(bytes32,bytes) view returns(bytes4)'],rpc);
   const digest=p=>TypedDataEncoder.hash({name:'USDC',version:'2',chainId:11155111,verifyingContract:usdc.token.address},transferAuthorizationTypes,p.payload.authorization);
   const check=p=>vaultVerifier.isValidSignature(digest(p),p.payload.signature);
   assert.equal(await check(approved),'0x1626ba7e');
   const otherVaultVerifier=new Contract(rootNode.vault,['function isValidSignature(bytes32,bytes) view returns(bytes4)'],rpc);
   assert.equal(await otherVaultVerifier.isValidSignature(digest(approved),approved.payload.signature),'0xffffffff');
   const wrongActor=await signVaultPayment(privateKeyToAccount(Wallet.createRandom().privateKey),childNode.vault,childNode.generation,seller.requirement,BigInt(now+3600),currentTime);
   assert.equal(await check(wrongActor),'0xffffffff');
   const excessive=await signVaultPayment(actor,childNode.vault,childNode.generation,{...seller.requirement,amount:'2000001'},BigInt(now+3600),currentTime);
   assert.equal(await check(excessive),'0xffffffff');
   const wrongGeneration=await signVaultPayment(actor,childNode.vault,childNode.generation+1n,seller.requirement,BigInt(now+3600),currentTime);
   assert.equal(await check(wrongGeneration),'0xffffffff');
   assert.equal(await vaultVerifier.isValidSignature(id('unrelated message'),approved.payload.signature),'0xffffffff');
   for(const change of ['revoke','tighten','rebind']){
     const snapshot=await rpc.send('evm_snapshot',[]);
     if(change==='revoke')await write('negative-revoke-child',controller,'revokeSubtree',[2]);
     if(change==='tighten')await write('negative-tighten-root',controller,'tightenPolicy',[1,{...policy,maxAmounts:[1n,1_000_000n]}]);
     if(change==='rebind')await write('negative-rebind-root',controller,'setRootOperator',[1,ownerAddress,policy]);
     assert.equal(await check(approved),'0xffffffff');
     assert.equal(await rpc.send('evm_revert',[snapshot]),true);
   }
   assert.equal(await check(approved),'0x1626ba7e');
   const result=await purchase(context,args);
   assert.equal(result.status,'confirmed');assert.equal(result.amount,'10000');
   assert.equal(await token.balanceOf(childNode.vault),1_990_000n);
   assert.equal(await token.balanceOf(donor),original-9_990_000n);
   // New handler instance proves private journal retry survives process reconstruction.
   assert.deepEqual(await paymentHandler(config)(context,args),result);
   await assert.rejects(purchase(context,{...args,maxAmount:'20000'}));
   await assert.rejects(purchase(context,{...args,serviceId:'unconfigured',operationKey:id('no-service')}));
   assert.equal(await token.balanceOf(childNode.vault),1_990_000n);
   transactions.push({name:'x402-research-payment',transactionHash:result.transactionHash,amountRaw:'10000',retryChargedAgain:false});
 }
 if(testPayments){
   const manager=new Contract(poolManager,['function initialize((address,address,uint24,int24,address),uint160) returns(int24)','function extsload(bytes32) view returns(bytes32)'],owner);
   const poolSlot=keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32','uint256'],[poolId,6]));
   if((BigInt(await manager.extsload(poolSlot)) & ((1n<<160n)-1n))===0n) await write('initialize-usdc-quote-pool',manager,'initialize',[[...tokens,3000,60,ZeroAddress],1n<<96n]);
   await write('open-usdc-lp',controller,'openPosition',[1,15_000_000n,[500_000n,500_000n],now+3600]);
   const vault=new Contract(rootNode.vault,['function positionLiquidity() view returns(uint128)'],rpc);
   assert.equal(await vault.positionLiquidity(),15_000_000n);
   await write('close-usdc-lp',controller,'closePosition',[1,[440_000n,440_000n],now+3600]);
   assert.equal(await vault.positionLiquidity(),0n);
 }
 await write('recover-child',controller,'ownerEmergencyRecover',[2]);
 await write('recover-root',controller,'ownerEmergencyRecover',[1]);
 assert.equal(await token.balanceOf(rootNode.vault),0n);assert.equal(await token.balanceOf(childNode.vault),0n);
 await write('restore-fork-funding',token.connect(owner),'transfer',[donor,await token.balanceOf(ownerAddress)-originalOwnerBalance]);
 const roundingLoss=original-await token.balanceOf(donor);assert(roundingLoss>=0n&&roundingLoss<=(testPayments?2n:0n));
 const report={checkedAt:new Date().toISOString(),network:'disposable Ethereum Sepolia fork',forkBlock,token:usdc.token,checks:['Real Circle USDC proxy reports 6 decimals','Root funded with 10 USDC; child receives 2; root retains 8','SDK preserves raw balances and readable ENS child name','Excess amount and wrong signer rejected',`Owner recovers remaining USDC; LP rounding loss ${roundingLoss} raw units`,...(testPayments?['ERC1271 rejects wrong signer, excess amount, wrong generation, arbitrary digest, revoked child, tightened ancestor and operator rebind','Six-decimal USDC/DEMO-USD pool initialized; LP opened and closed with explicit minimums','Official x402 exact facilitator accepts vault ERC1271 and settles 0.01 USDC','HTTP402 to signed request to independently confirmed Transfer and AuthorizationUsed','Restart retry reuses receipt without another charge; conflicting operation and unconfigured service rejected']:[])],transactions,publicTransactionsSent:0,limitations:['No public deployment or token movement',testPayments?'Local demo seller only; no economic USDC price claim for valueless DEMO-USD':'No USDC Uniswap pool or x402 payment tested','Namespace replaced only inside disposable fork; public deployment must preserve existing namespace']};
 report.vaultArchitecture='eip1167';
 report.checks.unshift('Root and child are exact 45-byte EIP-1167 proxies, bound to the controller and rejecting reinitialization');
 if(testPayments)report.checks.push('A child payment signature cannot be replayed against the sibling/root proxy');
 await writeFile(new URL(testPayments?'../deployments/usdc-x402-fork.json':'../deployments/usdc-fork.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(blockTimer)clearInterval(blockTimer);if(seller)await seller.close();anvil.kill('SIGTERM');rpc.destroy();if(privateDirectory)await rm(privateDirectory,{recursive:true,force:true});}
