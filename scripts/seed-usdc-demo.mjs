import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Contract, JsonRpcProvider, Wallet, ZeroAddress, parseEther } from 'ethers';
import { journaledTransaction } from './lib/sepolia-transactions.mjs';
import { etherscanKey } from './lib/etherscan-verification.mjs';
import { verifyDeployment } from './verify-deployment.mjs';

const broadcast=process.argv.includes('--broadcast');
const manifestPath=process.env.ACT_DEPLOYMENT_MANIFEST ?? new URL('../deployments/usdc-sepolia.json',import.meta.url);
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const rpc=new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
const save=()=>writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
const artifact=async name=>JSON.parse(await readFile(new URL(`../contracts/out/${name}.sol/${name}.json`,import.meta.url),'utf8'));
try {
  if((await rpc.getNetwork()).chainId!==11155111n)throw new Error('Expected Sepolia');
  if(!broadcast){console.log(JSON.stringify({mode:'inspect',status:manifest.status,uniswap:manifest.uniswap??null,bootstrap:manifest.bootstrap??null}));}
  else {
    await etherscanKey();
    const controllerAddress=manifest.contracts.CapitalController?.address;
    if(!controllerAddress || !manifest.uniswap || !manifest.ensNamespace.subregistry || manifest.ensNamespace.subregistry===ZeroAddress)throw new Error('Deploy and attach the capital system first');
    const keys=join(homedir(),'.agent-capital-tree/keys');
    const signer=(await Wallet.fromEncryptedJson(await readFile(join(keys,'jury-e2e.keystore.json'),'utf8'),await readFile(join(keys,'jury-e2e.password'),'utf8'))).connect(rpc);
    if(signer.address.toLowerCase()!==manifest.deployer.toLowerCase())throw new Error('Unexpected seed operator');
    const controller=new Contract(controllerAddress,(await artifact('CapitalController')).abi,signer);
    if(manifest.tokens.length!==2 || manifest.tokens.some(t=>t.decimals!==6) || !manifest.tokens.some(t=>t.symbol==='USDC') || !manifest.tokens.some(t=>t.symbol==='DEMO-USD')) throw Error('Expected reviewed six-decimal USDC/DEMO-USD pair');
    const tokens=manifest.tokens.map(token=>new Contract(token.address,['function mint()','function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)'],signer));
    const manager=new Contract(manifest.uniswap.poolManager,['function initialize((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,uint160 sqrtPriceX96) returns(int24)'],signer);
    const now=(await rpc.getBlock('latest')).timestamp;
    manifest.bootstrap??={purpose:'USDC capital demo with optional LP liquidity; owner and root operator are the test-owner wallet.',policyExpiry:String(now+180*86400),deadline:String(now+7200),transactions:{}};
    await save();
    const seed=manifest.bootstrap;
    async function send(name,contract,method,args){
      const request=await contract[method].populateTransaction(...args);
      const {receipt}=await journaledTransaction({rpc,signer,directory:join(homedir(),'.agent-capital-tree/usdc-seed',controllerAddress),name,request});
      seed.transactions[name]={transactionHash:receipt.hash,blockNumber:receipt.blockNumber};await save();return receipt;
    }
    const key=[manifest.tokens[0].address,manifest.tokens[1].address,3000,60,ZeroAddress];
    if(!manifest.uniswap.initialization){
      const initialized=await send('initialize-pool',manager,'initialize',[key,1n<<96n]);
      manifest.uniswap.initialization={transactionHash:initialized.hash,blockNumber:initialized.blockNumber};await save();
    }
    const capabilities=[40n,44n,48n,52n,56n,60n,64n,68n].reduce((mask,bit)=>mask|(1n<<bit),0n);
    const policy={capabilities,maxAmounts:[2_000_000n,2_000_000n],expiry:BigInt(seed.policyExpiry),tokenMask:3,poolId:manifest.uniswap.poolId};
    const created=await send('create-seed-root',controller,'createRoot',['capital',policy]);
    const rootLog=created.logs.filter(log=>log.address.toLowerCase()===controllerAddress.toLowerCase()).map(log=>{try{return controller.interface.parseLog(log);}catch{return null;}}).find(log=>log?.name==='NodeCreated'&&log.args.parentId===0n);
    if(!rootLog)throw new Error('Seed root creation event missing');
    seed.rootId=rootLog.args.rootId.toString();await save();
    await send('authorize-seed-operator',controller,'setRootOperator',[seed.rootId,signer.address,policy]);
    for(let i=0;i<2;i++){if(manifest.tokens[i].symbol==='DEMO-USD' && await tokens[i].balanceOf(signer.address)<2_000_000n) await send(`claim-token-${i}`,tokens[i],'mint',[]);await send(`approve-token-${i}`,tokens[i],'approve',[controllerAddress,2_000_000n]);}
    await send('fund-seed-root',controller,'fundRoot',[seed.rootId,[2_000_000n,2_000_000n]]);
    const opened=await send('open-seed-position',controller,'openPosition',[seed.rootId,30_000_000n,[2_000_000n,2_000_000n],seed.deadline]);
    const node=await controller.getNode(seed.rootId);
    const vault=new Contract(node.vault,['function positionTokenId() view returns(uint256)','function positionLiquidity() view returns(uint128)'],rpc);
    const tokenId=await vault.positionTokenId(),liquidity=await vault.positionLiquidity();
    if(tokenId===0n || liquidity!==30_000_000n)throw new Error('Seed liquidity verification failed');
    const positionManager=new Contract(manifest.uniswap.positionManager,['function ownerOf(uint256) view returns(address)'],rpc);
    if((await positionManager.ownerOf(tokenId)).toLowerCase()!==node.vault.toLowerCase())throw new Error('LP NFT left seed vault');
    manifest.uniswap.seeded={transactionHash:opened.hash,blockNumber:opened.blockNumber,rootId:seed.rootId,vault:node.vault,tokenId:tokenId.toString(),liquidity:liquidity.toString()};
    manifest.limitations=['Testnet assets only; DEMO-USD is valueless and pool price is not a real USD valuation.','x402 service purchases require an explicitly configured Sepolia-capable seller and PAY mandate.'];
    manifest.status='deployed';await save();
    await verifyDeployment(manifestPath);
    console.log(JSON.stringify({status:manifest.status,seeded:manifest.uniswap.seeded}));
  }
}finally{rpc.destroy();}
