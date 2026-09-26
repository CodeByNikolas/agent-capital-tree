import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, getCreateAddress, keccak256 } from 'ethers';
import { journaledTransaction } from './lib/sepolia-transactions.mjs';
const rpc = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
const path = new URL('../deployments/usdc-sepolia.json', import.meta.url);
const manifest = JSON.parse(await readFile(path, 'utf8'));
try {
  if ((await rpc.getNetwork()).chainId !== 11155111n) throw Error('Expected Sepolia');
  if (!process.argv.includes('--broadcast')) { console.log(JSON.stringify({ mode: 'inspect', deployer: manifest.deployer, quote: manifest.tokens.find(t => t.symbol === 'DEMO-USD') ?? null })); }
  else {
    const keys = join(homedir(), '.agent-capital-tree/keys');
    const signer = (await Wallet.fromEncryptedJson(await readFile(join(keys, 'jury-e2e.keystore.json'), 'utf8'), await readFile(join(keys, 'jury-e2e.password'), 'utf8'))).connect(rpc);
    if (signer.address !== manifest.deployer) throw Error('Unexpected USDC deployer');
    const artifact = JSON.parse(await readFile(new URL('../contracts/out/DemoQuote.sol/DemoQuote.json', import.meta.url), 'utf8'));
    const request = await new ContractFactory(artifact.abi, artifact.bytecode.object, signer).getDeployTransaction();
    const { receipt, transaction } = await journaledTransaction({ rpc, signer, directory: join(homedir(), '.agent-capital-tree/deployments-usdc'), name: 'DemoQuote', request });
    const address = getCreateAddress({ from: signer.address, nonce: transaction.nonce });
    if (receipt.contractAddress !== address || keccak256(await rpc.getCode(address)) !== keccak256(artifact.deployedBytecode.object)) throw Error('Quote deployment mismatch');
    const quote = new Contract(address, artifact.abi, rpc);
    if (await quote.decimals() !== 6n || await quote.symbol() !== 'DEMO-USD') throw Error('Quote metadata mismatch');
    manifest.tokens = [{ ...manifest.token, status: 'confirmed' }, { address, symbol: 'DEMO-USD', name: 'Valueless Demo Quote', decimals: 6, status: 'confirmed', testnetOnly: true, valueless: true, transactionHash: receipt.hash, blockNumber: receipt.blockNumber }].sort((a,b) => BigInt(a.address) < BigInt(b.address) ? -1 : 1);
    await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({ quote: address, decimals: 6, transactionHash: receipt.hash }));
  }
} finally { rpc.destroy(); }
