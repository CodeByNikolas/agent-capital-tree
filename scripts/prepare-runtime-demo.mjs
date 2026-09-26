import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Contract, JsonRpcProvider, Wallet, parseEther } from 'ethers';
import { prepareRootOperator } from '../packages/runtime/dist/index.js';
import { journaledTransaction } from './lib/sepolia-transactions.mjs';

// Explicit Sepolia-only setup for the independent jury wallet and local runtime.
const broadcast=process.argv.includes('--broadcast');
const deployment=JSON.parse(await readFile(new URL('../deployments/sepolia.json',import.meta.url),'utf8'));
const statePath=new URL('../deployments/runtime-sepolia.json',import.meta.url);
const privateBase=join(homedir(),'.agent-capital-tree');
const runtimeRoot=join(privateBase,'runtime-demo');
const configPath=join(privateBase,'runtime-demo.config.json');
const rpcUrl='https://ethereum-sepolia.publicnode.com';
const rpc=new JsonRpcProvider(rpcUrl);
let state;
try{state=JSON.parse(await readFile(statePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const save=()=>writeFile(statePath,JSON.stringify(state,null,2)+'\n');
try{
  if((await rpc.getNetwork()).chainId!==11155111n||deployment.status!=='deployed')throw new Error('Verified Sepolia system and seeded pool required');
  if(!broadcast){console.log(JSON.stringify({mode:'inspect',deployerBalanceWei:(await rpc.getBalance(deployment.deployer)).toString(),juryBalanceWei:(await rpc.getBalance(deployment.testUser)).toString(),state:state??null}));}
  else{
    const imageId=process.env.ACT_WORKER_IMAGE_ID;
    if(!/^sha256:[a-f0-9]{64}$/.test(imageId??''))throw new Error('Set the verified ACT_WORKER_IMAGE_ID');
    const load=async name=>(await Wallet.fromEncryptedJson(await readFile(join(privateBase,'keys',`${name}.keystore.json`),'utf8'),await readFile(join(privateBase,'keys',`${name}.password`),'utf8'))).connect(rpc);
    const owner=await load('jury'),deployer=await load('deployer');
    if(owner.address!==deployment.testUser||deployer.address!==deployment.deployer)throw new Error('Unexpected demo wallet');
    const controllerAddress=deployment.contracts.CapitalController.address;
    const abi=JSON.parse(await readFile(new URL('../contracts/out/CapitalController.sol/CapitalController.json',import.meta.url),'utf8')).abi;
    const controller=new Contract(controllerAddress,abi,owner);
    const tokens=deployment.tokens.map(t=>new Contract(t.address,['function mint()','function approve(address,uint256) returns(bool)'],owner));
    state??={chainId:11155111,controller:controllerAddress,owner:owner.address,expiry:String((await rpc.getBlock('latest')).timestamp+7*86400),transactions:{},status:'preparing'};
    if(state.controller!==controllerAddress||state.owner!==owner.address)throw new Error('Runtime demo domain mismatch');
    await save();
    async function send(name,signer,request){
      const {receipt}=await journaledTransaction({rpc,signer,directory:join(privateBase,'runtime-setup-transactions'),name,request});
      state.transactions[name]={transactionHash:receipt.hash,blockNumber:receipt.blockNumber};await save();return receipt;
    }
    // The root creation reserves ~6.5M gas; 0.01 ETH cannot cover the current max-fee reservation.
    await send('jury-gas-top-up',deployer,{to:owner.address,value:parseEther('0.01')});
    const capabilities=[40n,44n,48n,52n,56n,60n,64n].reduce((a,b)=>a|(1n<<b),0n);
    const policy={capabilities,maxAmounts:[parseEther('100'),parseEther('100')],expiry:BigInt(state.expiry),tokenMask:3,poolId:deployment.uniswap.poolId};
    const created=await send('create-runtime-root',owner,await controller.createRoot.populateTransaction('runtime-demo',policy));
    const event=created.logs.filter(l=>l.address.toLowerCase()===controllerAddress.toLowerCase()).map(l=>{try{return controller.interface.parseLog(l);}catch{return null;}}).find(l=>l?.name==='NodeCreated'&&l.args.parentId===0n);
    if(!event)throw new Error('Missing root creation event');
    state.rootId=event.args.rootId.toString();
    state.operator=await prepareRootOperator(runtimeRoot,state.rootId,controllerAddress);await save();
    await send('bind-runtime-operator',owner,await controller.setRootOperator.populateTransaction(state.rootId,state.operator,policy));
    for(let i=0;i<2;i++){
      await send(`claim-demo-token-${i}`,owner,await tokens[i].mint.populateTransaction());
      await send(`approve-demo-token-${i}`,owner,await tokens[i].approve.populateTransaction(controllerAddress,parseEther('100')));
    }
    await send('fund-runtime-root',owner,await controller.fundRoot.populateTransaction(state.rootId,[parseEther('100'),parseEther('100')]));
    // Four separately journaled transfers stay below the existing 0.01 ETH value ceiling.
    for(const [i,amount]of ['0.01','0.01','0.01','0.005'].entries())await send(`operator-gas-${i}`,deployer,{to:state.operator,value:parseEther(amount)});
    const config={runtimeRoot,rootId:state.rootId,rpcUrl,controller:controllerAddress,inference:'cliproxyapi',upstream:'http://100.91.160.81:8317/v1',imageId,models:['gpt-6-luna','gpt-6-sol'],childGasWei:'20000000000000000'};
    await mkdir(privateBase,{recursive:true,mode:0o700});
    await writeFile(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'}).catch(async error=>{
      if(error.code!=='EEXIST'||await readFile(configPath,'utf8')!==JSON.stringify(config,null,2)+'\n')throw error;
    });
    state.status='ready';await save();
    console.log(JSON.stringify({rootId:state.rootId,operator:state.operator,operatorGasWei:(await rpc.getBalance(state.operator)).toString(),privateConfigPath:configPath}));
  }
}finally{rpc.destroy();}
