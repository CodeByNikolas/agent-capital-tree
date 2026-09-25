import { readFile, writeFile } from 'node:fs/promises';
import { JsonRpcProvider, Interface, toBeHex, zeroPadValue } from 'ethers';

const reportPath=new URL('../deployments/runtime-e2e.json',import.meta.url);
const report=JSON.parse(await readFile(reportPath,'utf8'));
const setup=JSON.parse(await readFile(new URL('../deployments/runtime-sepolia.json',import.meta.url),'utf8'));
if(report.status!=='passed'||report.controller!==setup.controller||report.rootId!==setup.rootId)throw new Error('Completed matching runtime evidence required');
const abi=JSON.parse(await readFile(new URL('../contracts/out/CapitalController.sol/CapitalController.json',import.meta.url),'utf8')).abi;
const iface=new Interface(abi);
const rpc=new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
try{
  if((await rpc.getNetwork()).chainId!==11155111n)throw new Error('Expected Sepolia');
  const head=await rpc.getBlock('latest');
  const logs=await rpc.getLogs({address:setup.controller,fromBlock:setup.transactions['create-runtime-root'].blockNumber,toBlock:head.number,topics:[null,zeroPadValue(toBeHex(BigInt(setup.rootId)),32)]});
  const events=logs.map(log=>{
    const parsed=iface.parseLog(log);
    if(!parsed||parsed.args.rootId.toString()!==setup.rootId)throw new Error('Unexpected controller event');
    return {name:parsed.name,transactionHash:log.transactionHash,blockNumber:log.blockNumber,blockHash:log.blockHash,logIndex:log.index,args:Object.fromEntries(parsed.fragment.inputs.map((input,i)=>[input.name,parsed.args[i]]))};
  });
  console.log(JSON.stringify({checkedAtBlock:head.number,eventCount:events.length,kinds:[...new Set(events.map(e=>e.name))]}));
  if(process.argv.includes('--write')){
    report.eventVerification={source:'Sepolia RPC',checkedAtBlock:head.number,blockHash:head.hash,events};
    await writeFile(reportPath,JSON.stringify(report,(_key,value)=>typeof value==='bigint'?value.toString():value,2)+'\n');
  }
}finally{rpc.destroy();}
