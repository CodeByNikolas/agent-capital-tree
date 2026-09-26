import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { JsonRpcProvider } from 'ethers';
const env = Object.fromEntries((await readFile(join(homedir(), '.agent-capital-tree/multibaas-admin.env'), 'utf8')).split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]; }));
const manifestPath = process.env.ACT_DEPLOYMENT_MANIFEST ?? new URL('../deployments/usdc-sepolia.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const address = manifest.contracts.CapitalController?.address;
if (!address) throw Error('USDC controller not deployed');
const label = manifest.multibaas?.label ?? 'capitalcontrollerusdc';
const origin = new URL(env.MULTIBAAS_URL).origin;
if (origin !== 'https://d7zveyyfkvdbxdbd7n3rk6o3ee.multibaas.com') throw Error('Unexpected MultiBaas deployment');
async function api(path, method='GET', body) {
  const response=await fetch(`${origin}/api/v0${path}`,{method,headers:{authorization:`Bearer ${env.MULTIBAAS_API_KEY}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
  const data=await response.json();
  if(!response.ok) { const error=Error(`MultiBaas ${method} ${path}: HTTP ${response.status}: ${data.message}`);error.status=response.status;throw error; }
  return data.result;
}
const rpc=new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
try {
  if((await rpc.getNetwork()).chainId!==11155111n)throw Error('Expected Sepolia');
  if(!process.argv.includes('--execute')) { console.log(JSON.stringify({mode:'inspect',address,label,head:await rpc.getBlockNumber()})); }
  else {
    const artifact=JSON.parse(await readFile(new URL('../contracts/out/CapitalController.sol/CapitalController.json',import.meta.url),'utf8'));
    let registered;
    try { registered=await api(`/contracts/${label}/1.0`); } catch(error) { if(error.status!==404)throw error; }
    if(!registered) await api(`/contracts/${label}`,'POST',{label,contractName:'CapitalController',version:'1.0',rawAbi:JSON.stringify(artifact.abi),bin:artifact.bytecode.object});
    const aliases=await api('/chains/ethereum/addresses');
    if(!aliases.some(a=>a.address.toLowerCase()===address.toLowerCase())) await api('/chains/ethereum/addresses','POST',{alias:label,address});
    let status;
    try { status=await api(`/chains/ethereum/addresses/${address}/contracts/${label}/status`); } catch(error) { if(error.status!==404)throw error; }
    if(!status) {
      const startingBlock=await rpc.getBlockNumber();
      await api(`/chains/ethereum/addresses/${address}/contracts`,'POST',{label,version:'1.0',startingBlock:String(startingBlock)});
      status=await api(`/chains/ethereum/addresses/${address}/contracts/${label}/status`);
    }
    manifest.multibaas={label,indexingStartBlock:status.startBlockNumber,status,configuredAt:new Date().toISOString()};
    await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    console.log(JSON.stringify({address,label,status}));
  }
} finally {rpc.destroy();}
