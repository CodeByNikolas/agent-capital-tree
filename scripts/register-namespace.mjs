import { journaledTransaction } from './lib/sepolia-transactions.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Contract, JsonRpcProvider, Wallet, ZeroAddress, ZeroHash, id } from 'ethers';

const action = process.argv[2] ?? 'inspect';
const usdcVersion = process.argv.includes('--usdc');
if (!['inspect', 'commit', 'register'].includes(action)) throw new Error('Use inspect, commit or register');
const broadcast = process.argv.includes('--broadcast');
if (action !== 'inspect' && !broadcast) throw new Error('Writing requires --broadcast');
const rpc = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
if ((await rpc.getNetwork()).chainId !== 11155111n) throw new Error('Refusing non-Sepolia network');
const manifestPath = new URL(usdcVersion ? '../deployments/usdc-sepolia.json' : '../deployments/sepolia.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const directory = join(homedir(), '.agent-capital-tree');
const label = usdcVersion ? 'agentcapitalusdc' : 'agentcapitaltree';
const duration = 365n * 24n * 60n * 60n;

async function artifact(name, expectedAddress) {
  const file = new URL(`../contracts/lib/ens-contracts-v2/contracts/deployments/sepolia/${name}.json`, import.meta.url);
  const data = JSON.parse(await readFile(file, 'utf8'));
  if (data.address.toLowerCase() !== expectedAddress.toLowerCase()) throw new Error('Unexpected contract address');
  const code = await rpc.getCode(data.address);
  function normalize(value) {
    const bytes = Buffer.from(value.slice(2), 'hex');
    for (const refs of Object.values(data.immutableReferences ?? {})) {
      for (const ref of refs) bytes.fill(0, ref.start, ref.start + ref.length);
    }
    return bytes.toString('hex');
  }
  if (normalize(code) !== normalize(data.deployedBytecode)) throw new Error(`${name} bytecode mismatch`);
  return data;
}
const registrarData = await artifact('ETHRegistrar', '0xa4449a0dd2b83007553d9b1d28b583a46a805a30');
const registryData = await artifact('ETHRegistry', '0x67b728a792e789a8978b30cf1b3b641f19354b43');
const tokenData = await artifact('MockUSDC', '0xd3322b29a7bdee707d1684676f149bf41aa3422f');
let signer = rpc;
if (broadcast) {
  signer = (await Wallet.fromEncryptedJson(
    await readFile(join(directory, 'keys/deployer.keystore.json'), 'utf8'),
    await readFile(join(directory, 'keys/deployer.password'), 'utf8'),
  )).connect(rpc);
  if (signer.address !== manifest.deployer) throw new Error('Signer does not match deployment manifest');
}
const registrar = new Contract(registrarData.address, registrarData.abi, signer);
const registry = new Contract(registryData.address, registryData.abi, rpc);
const token = new Contract(tokenData.address, tokenData.abi, signer);
const available = await registrar.isAvailable(label);
console.log(JSON.stringify({ action, chainId: 11155111, name: `${label}.eth`, available, owner: manifest.deployer }));
if (!available) {
  const state = await registry.getState(id(label));
  if (state.latestOwner.toLowerCase() !== manifest.deployer.toLowerCase()) throw new Error('Namespace belongs to another owner');
  if (broadcast) {
    manifest.ensNamespace ??= { name: `${label}.eth`, registrar: registrarData.address, registry: registryData.address, transactions: {} };
    manifest.ensNamespace.resource = state.resource.toString();
    manifest.ensNamespace.expiry = state.expiry.toString();
    manifest.ensNamespace.subregistry = await registry.getSubregistry(label);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log('Namespace already owned by the deployment wallet.');
  process.exit(0);
}
const [base, premium] = await registrar.getRegisterPrice(label, duration, tokenData.address);
const price = base + premium;
if (price > 25_000_000n) throw new Error('Registration quote exceeds 25 mock USDC safety ceiling');
console.log('Registration price in raw mock USDC:', price.toString());
if (action === 'inspect') process.exit(0);

await mkdir(join(directory, 'registration'), { recursive: true, mode: 0o700 });
const secretPath = join(directory, usdcVersion ? 'registration/usdc-namespace-secret' : 'registration/namespace-secret');
let secret;
try { secret = await readFile(secretPath, 'utf8'); }
catch (error) {
  if (error.code !== 'ENOENT' || action !== 'commit') throw new Error('Registration secret unavailable');
  secret = `0x${randomBytes(32).toString('hex')}`;
  await writeFile(secretPath, secret, { flag: 'wx', mode: 0o600 });
}
const commitment = await registrar.makeCommitment(label, signer.address, secret, ZeroAddress, ZeroAddress, duration, ZeroHash);
async function send(contract, method, args) {
  const { receipt, transaction } = await journaledTransaction({ rpc, signer,
    directory: join(directory, 'registration', label), name: method,
    request: await contract[method].populateTransaction(...args), maxGasCostWei: 1_000_000_000_000_000n });
  manifest.ensNamespace ??= { name: `${label}.eth`, registrar: registrarData.address, registry: registryData.address, transactions: {} };
  manifest.ensNamespace.transactions[method] = { hash: transaction.hash, block: receipt.blockNumber };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
if (action === 'commit') {
  const at = await registrar.commitmentAt(commitment);
  if (at === 0n) await send(registrar, 'commit', [commitment]);
  else console.log('Existing commitment found; no duplicate transaction.');
  if (await token.balanceOf(signer.address) < 25_000_000n) await send(token, 'mint', [signer.address, 25_000_000n]);
  if (await token.allowance(signer.address, registrarData.address) < 25_000_000n) await send(token, 'approve', [registrarData.address, 25_000_000n]);
} else {
  const at = await registrar.commitmentAt(commitment);
  const block = await rpc.getBlock('latest');
  if (at === 0n || BigInt(block.timestamp) < at + await registrar.MIN_COMMITMENT_AGE()) throw new Error('Commitment is not mature yet');
  await send(registrar, 'register', [label, signer.address, secret, ZeroAddress, ZeroAddress, duration, tokenData.address, ZeroHash]);
  const state = await registry.getState(id(label));
  if (state.latestOwner.toLowerCase() !== signer.address.toLowerCase()) throw new Error('Namespace ownership verification failed');
  manifest.ensNamespace.resource = state.resource.toString();
  manifest.ensNamespace.expiry = state.expiry.toString();
  manifest.ensNamespace.subregistry = ZeroAddress;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('Namespace ownership verified; project subregistry attachment remains pending.');
}
