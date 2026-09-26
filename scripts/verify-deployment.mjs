import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Contract, JsonRpcProvider } from 'ethers';
import { etherscanKey, verifySource, verifyProxy } from './lib/etherscan-verification.mjs';

// No wallet or chain writes: source submission and proxy association only.
export async function verifyDeployment(manifestPath) {
  await etherscanKey();
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.chainId !== 11155111 || manifest.vaultArchitecture !== 'eip1167') throw Error('Expected the Sepolia clone deployment');
  const rpc = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
  try {
    const c = manifest.contracts;
    const artifact = JSON.parse(await readFile(new URL('../contracts/out/CapitalController.sol/CapitalController.json', import.meta.url), 'utf8'));
    const controller = new Contract(c.CapitalController.address, artifact.abi, rpc);
    const labelStore = await controller.LABEL_STORE();
    const tokens = manifest.tokens.map(token => token.address);
    const { poolManager, positionManager, permit2 } = manifest.uniswap;
    const namespace = manifest.ensNamespace.name.replace(/\.eth$/, '');
    const records = [];
    const source = async (...args) => { records.push(await verifySource(...args)); };
    await source(c.CapitalVaultImplementation.address, 'src/CapitalVault.sol:CapitalVault', ['address','address','address','address','address'], [poolManager,positionManager,permit2,...tokens]);
    await source(c.VaultFactory.address, 'src/VaultFactory.sol:VaultFactory', ['address','address','address','address[2]'], [poolManager,positionManager,permit2,tokens]);
    await source(c.NodeFactory.address, 'src/NodeFactory.sol:NodeFactory', ['address'], [c.VaultFactory.address]);
    await source(c.CapitalController.address, 'src/CapitalController.sol:CapitalController', ['address','address','address','address[2]','string','bytes32'], [manifest.ensNamespace.registry,labelStore,c.NodeFactory.address,tokens,namespace,manifest.uniswap.poolId]);
    await source(c.ProjectRegistry.address, 'src/ens/ManagedRegistry.sol:ManagedRegistry', ['address','address','address','string'], [labelStore,c.CapitalController.address,manifest.ensNamespace.registry,namespace]);
    const quote = manifest.tokens.find(token => token.symbol === 'DEMO-USD');
    if (quote) await source(quote.address, 'src/DemoQuote.sol:DemoQuote');
    const next = await controller.nextNodeId();
    for (let id = 1n; id < next; id++) {
      const node = await controller.getNode(id);
      await source(node.childRegistry, 'src/ens/ManagedRegistry.sol:ManagedRegistry', ['address','address','address','string'], [labelStore,c.CapitalController.address,node.registry,node.label]);
      records.push(await verifyProxy(node.vault, c.CapitalVaultImplementation.address, rpc));
    }
    manifest.verification = { checkedAt: new Date().toISOString(), chainId: 11155111, nodeCount: (next - 1n).toString(), records };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    return manifest.verification;
  } finally { rpc.destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyDeployment(process.env.ACT_DEPLOYMENT_MANIFEST ?? new URL('../deployments/usdc-sepolia.json', import.meta.url));
}
