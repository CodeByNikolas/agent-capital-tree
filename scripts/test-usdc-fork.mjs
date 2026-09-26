import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {Contract,ContractFactory,JsonRpcProvider,JsonRpcSigner,Wallet,AbiCoder,keccak256,ZeroAddress,ZeroHash,id} from 'ethers';
import {createRequire} from 'node:module';
import {startX402DemoService} from './lib/x402-demo-service.mjs';
import {paymentHandler} from '../packages/runtime/dist/payments.js';
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
 const tokens=[usdc.token.address,manifest.tokens[1].address].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
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
 const now=(await rpc.getBlock('latest')).timestamp;
 const roles=(1n<<40n)|(1n<<60n)|(1n<<64n)|(testPayments?1n<<68n:0n);
 const policy={capabilities:roles,maxAmounts:[10_000_000n,0n],expiry:now+3600,tokenMask:1,poolId:ZeroHash};
 await write('create-root',controller,'createRoot',['usdc-fork',policy]);
 await write('bind-operator',controller,'setRootOperator',[1,ownerAddress,policy]);
 await write('approve-usdc',token.connect(owner),'approve',[await controller.getAddress(),10_000_000n]);
 await write('fund-10-usdc',controller,'fundRoot',[1,[10_000_000n,0n]]);
 const childWallet=Wallet.createRandom();const child=childWallet.address;
 const childPolicy={...policy,maxAmounts:[2_000_000n,0n]};
 await write('delegate-2-usdc',controller,'spawnChild',[1,'researcher',child,childPolicy,[2_000_000n,0n],id('usdc-fork-researcher')]);
 const rootNode=await controller.getNode(1),childNode=await controller.getNode(2);
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
 await write('recover-child',controller,'ownerEmergencyRecover',[2]);
 await write('recover-root',controller,'ownerEmergencyRecover',[1]);
 assert.equal(await token.balanceOf(rootNode.vault),0n);assert.equal(await token.balanceOf(childNode.vault),0n);
 await write('restore-fork-funding',token.connect(owner),'transfer',[donor,testPayments?9_990_000n:10_000_000n]);
 assert.equal(await token.balanceOf(donor),original);
 const report={checkedAt:new Date().toISOString(),network:'disposable Ethereum Sepolia fork',forkBlock,token:usdc.token,checks:['Real Circle USDC proxy reports 6 decimals','Root funded with 10 USDC; child receives 2; root retains 8','SDK preserves raw balances and readable ENS child name','Excess amount and wrong signer rejected','Owner recovers remaining USDC; fork donor balance restored',...(testPayments?['Official x402 exact facilitator accepts vault ERC1271 and settles 0.01 USDC','HTTP402 to signed request to independently confirmed Transfer and AuthorizationUsed','Restart retry reuses receipt without another charge; conflicting operation and unconfigured service rejected']:[])],transactions,publicTransactionsSent:0,limitations:['No public deployment or token movement',testPayments?'USDC Uniswap pool not tested; local demo seller only':'No USDC Uniswap pool or x402 payment tested','Namespace replaced only inside disposable fork; public deployment must preserve existing namespace']};
 await writeFile(new URL(testPayments?'../deployments/usdc-x402-fork.json':'../deployments/usdc-fork.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(blockTimer)clearInterval(blockTimer);if(seller)await seller.close();anvil.kill('SIGTERM');rpc.destroy();if(privateDirectory)await rm(privateDirectory,{recursive:true,force:true});}
