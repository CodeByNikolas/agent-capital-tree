import { journaledTransaction } from './lib/sepolia-transactions.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, id, keccak256, getCreateAddress, AbiCoder, ZeroAddress } from 'ethers';

// Sepolia only. Signed transactions are journaled before broadcast so retries preserve nonce/value.
const broadcast = process.argv.includes('--broadcast');
const attach = process.argv.includes('--attach');
const usdcVersion = process.argv.includes('--usdc');
const namespace = usdcVersion ? 'agentcapitalusdc' : 'agentcapitaltree';
const rpc = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
const manifestPath = new URL(usdcVersion ? '../deployments/usdc-sepolia.json' : '../deployments/sepolia.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const privateDir = join(homedir(), usdcVersion ? '.agent-capital-tree/deployments-usdc' : '.agent-capital-tree/deployments');
const addresses = {
  poolManager: '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',
  positionManager: '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
};
const codeHashes = {
  poolManager: '0x09930125a49f5b95caf8052991cc14d1240dca8b43f42b899115b86867e4bce1',
  positionManager: '0xcffd746f78c2b50aafd19076bbe9c48f14446e5248fc5d76b9b4896610e51aab',
  permit2: '0x96d9f5c3f0fb0423426b7f970186235b7347027f4e5c19c40c412b7d97fc3751',
};
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const save = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const artifact = async name => JSON.parse(await readFile(new URL(`../contracts/out/${name}.sol/${name}.json`, import.meta.url), 'utf8'));
const ensArtifact = async name => JSON.parse(await readFile(new URL(`../contracts/lib/ens-contracts-v2/contracts/deployments/sepolia/${name}.json`, import.meta.url), 'utf8'));
function normalized(code, references = {}) {
  const bytes = Buffer.from(code.slice(2), 'hex');
  for (const group of Object.values(references)) for (const {start, length} of group) bytes.fill(0, start, start + length);
  return bytes.toString('hex');
}
try {
  if ((await rpc.getNetwork()).chainId !== 11155111n || manifest.chainId !== 11155111) throw new Error('Expected Sepolia');
  if (manifest.tokens?.length !== 2 || manifest.tokens.some(token => token.status !== 'confirmed')) throw new Error('Verified configured tokens required');
  if (usdcVersion) {
    const usdc = new Contract('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', ['function decimals() view returns(uint8)', 'function symbol() view returns(string)'], rpc);
    if (await usdc.decimals() !== 6n || await usdc.symbol() !== 'USDC' || !same(manifest.tokens[0].address, await usdc.getAddress())) throw new Error('Circle USDC configuration mismatch');
  }
  const tokens = manifest.tokens.map(token => token.address).sort((a,b) => BigInt(a) < BigInt(b) ? -1 : 1);
  const poolId = keccak256(AbiCoder.defaultAbiCoder().encode(['address','address','uint24','int24','address'], [...tokens, 3000, 60, ZeroAddress]));
  for (const [name,address] of Object.entries(addresses)) {
    if (keccak256(await rpc.getCode(address)) !== codeHashes[name]) throw new Error(`Unexpected ${name} deployment code`);
  }
  const positionManager = new Contract(addresses.positionManager, ['function poolManager() view returns(address)', 'function permit2() view returns(address)'], rpc);
  if (!same(await positionManager.poolManager(), addresses.poolManager) || !same(await positionManager.permit2(), addresses.permit2)) throw new Error('Uniswap deployment links mismatch');
  const registryData = await ensArtifact('ETHRegistry');
  const labelData = await ensArtifact('LabelStore');
  if (!same(registryData.address, manifest.ensNamespace.registry)) throw new Error('Unexpected ENS registry');
  for (const data of [registryData, labelData]) {
    if (normalized(await rpc.getCode(data.address), data.immutableReferences) !== normalized(data.deployedBytecode, data.immutableReferences)) throw new Error('ENS deployment bytecode mismatch');
  }
  const registry = new Contract(registryData.address, registryData.abi, rpc);
  const state = await registry.getState(id(namespace));
  if (!same(state.latestOwner, manifest.deployer) || state.resource.toString() !== manifest.ensNamespace.resource) throw new Error('ENS ownership/resource mismatch');
  if (!broadcast) {
    console.log(JSON.stringify({ chainId: 11155111, contracts: manifest.contracts, poolId, addresses, namespaceResource: state.resource.toString(), deployerBalanceWei: (await rpc.getBalance(manifest.deployer)).toString(), mode:'inspect' }));
  } else {
    const keys = join(homedir(), '.agent-capital-tree/keys');
    const signer = (await Wallet.fromEncryptedJson(await readFile(join(keys, 'deployer.keystore.json'),'utf8'), await readFile(join(keys, 'deployer.password'),'utf8'))).connect(rpc);
    if (!same(signer.address, manifest.deployer)) throw new Error('Unexpected deployer');
    const send = (name, request) => journaledTransaction({rpc,signer,directory:privateDir,name,request});
    async function deploy(name,args) {
      const data = await artifact(name);
      const request = await new ContractFactory(data.abi,data.bytecode.object,signer).getDeployTransaction(...args);
      const {receipt,transaction} = await send(name,request);
      const address = getCreateAddress({from:signer.address,nonce:transaction.nonce});
      if (!same(address,receipt.contractAddress)) throw new Error('Creation address mismatch');
      const code = await rpc.getCode(address);
      if (normalized(code,data.deployedBytecode.immutableReferences) !== normalized(data.deployedBytecode.object,data.deployedBytecode.immutableReferences)) throw new Error('Project deployment bytecode mismatch');
      manifest.contracts[name] = {address,transactionHash:receipt.hash,blockNumber:receipt.blockNumber,codeHash:keccak256(code)};
      await save();
      return new Contract(address,data.abi,signer);
    }
    // Constructor order is validated against the final reviewed artifacts before broadcasting.
    const vaultFactory = await deploy('VaultFactory',[addresses.poolManager,addresses.positionManager,addresses.permit2,tokens]);
    const nodeFactory = await deploy('NodeFactory',[await vaultFactory.getAddress()]);
    const controller = await deploy('CapitalController',[registryData.address,labelData.address,await nodeFactory.getAddress(),tokens,namespace,poolId]);
    if (!same(await controller.POOL_ID(),poolId) || !same(await controller.TOKEN0(),tokens[0]) || !same(await controller.TOKEN1(),tokens[1])) throw new Error('Controller configuration mismatch');
    const projectRegistry = await controller.PROJECT_REGISTRY();
    manifest.contracts.ProjectRegistry = {address:projectRegistry};
    manifest.uniswap = {...addresses,poolId,fee:3000,tickSpacing:60,tickLower:-600,tickUpper:600,codeHashes};
    if (attach) {
      const current = await registry.getSubregistry(namespace);
      if (!same(current,projectRegistry)) {
        if (!same(current,ZeroAddress)) throw new Error('Namespace already linked to another registry');
        const {receipt}=await send('attach-namespace',await registry.setSubregistry.populateTransaction(state.resource,projectRegistry));
        manifest.ensNamespace.transactions.attach={hash:receipt.hash,block:receipt.blockNumber};
      }
      if (!same(await registry.getSubregistry(namespace),projectRegistry)) throw new Error('Namespace attachment failed');
      manifest.ensNamespace.subregistry = projectRegistry;
    }
    manifest.status = attach ? 'contracts-deployed-pool-pending' : 'contracts-deployed-namespace-pending';
    await save();
    console.log(JSON.stringify({contracts:manifest.contracts,status:manifest.status}));
  }
} finally { rpc.destroy(); }
