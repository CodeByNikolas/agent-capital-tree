import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, parseEther, getCreateAddress } from 'ethers';

const broadcast = process.argv.includes('--broadcast');
const rpc = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
if ((await rpc.getNetwork()).chainId !== 11155111n) throw new Error('Expected Sepolia');
const manifestPath = new URL('../deployments/sepolia.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const artifact = JSON.parse(await readFile(new URL('../contracts/out/DemoToken.sol/DemoToken.json', import.meta.url), 'utf8'));
const save = () => writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const definitions = [['ACT-A', 'Agent Capital Tree Valueless Demo A'], ['ACT-B', 'Agent Capital Tree Valueless Demo B']];
if (!broadcast) {
  console.log(JSON.stringify({ chainId: 11155111, deployer: manifest.deployer, tokens: manifest.tokens ?? [], plannedTokens: definitions, balanceWei: (await rpc.getBalance(manifest.deployer)).toString() }));
  process.exit(0);
}
const keys = join(homedir(), '.agent-capital-tree/keys');
const signer = (await Wallet.fromEncryptedJson(await readFile(join(keys, 'deployer.keystore.json'), 'utf8'), await readFile(join(keys, 'deployer.password'), 'utf8'))).connect(rpc);
if (signer.address.toLowerCase() !== manifest.deployer.toLowerCase()) throw new Error('Wrong deployer');
manifest.tokens ??= [];
for (const [symbol, name] of definitions) {
  let entry = manifest.tokens.find(token => token.symbol === symbol);
  if (!entry) {
    const factory = new ContractFactory(artifact.abi, artifact.bytecode.object, signer);
    const request = await factory.getDeployTransaction(name, symbol);
    const gas = await rpc.estimateGas({ ...request, from: signer.address });
    const fees = await rpc.getFeeData();
    const gasLimit = gas * 12n / 10n;
    if (!fees.maxFeePerGas || gasLimit * fees.maxFeePerGas > parseEther('0.003')) throw new Error('Fee ceiling exceeded');
    const nonce = await rpc.getTransactionCount(signer.address, 'pending');
    const transaction = await signer.sendTransaction({ ...request, nonce, gasLimit });
    entry = { symbol, name, address: getCreateAddress({ from: signer.address, nonce }), decimals: 18, transactionHash: transaction.hash, status: 'submitted' };
    manifest.tokens.push(entry);
    await save();
    console.log(JSON.stringify({ symbol, transactionHash: transaction.hash, address: entry.address }));
  }
  const receipt = await rpc.waitForTransaction(entry.transactionHash, 2, 120000);
  if (!receipt || receipt.status !== 1) throw new Error('Token deployment not confirmed');
  if ((await rpc.getCode(entry.address)).toLowerCase() !== artifact.deployedBytecode.object.toLowerCase()) throw new Error('Deployed token bytecode mismatch');
  const token = new Contract(entry.address, artifact.abi, rpc);
  if (await token.symbol() !== symbol || await token.name() !== name || await token.decimals() !== 18n) throw new Error('Token metadata mismatch');
  entry.status = 'confirmed';
  entry.blockNumber = receipt.blockNumber;
  await save();
}
manifest.tokens.sort((a, b) => BigInt(a.address) < BigInt(b.address) ? -1 : 1);
await save();
if (process.argv.includes('--fund-test-user')) {
  if (manifest.testUser.toLowerCase() !== '0x0b59e040f864afd07ed448f58199a296413333bf') throw new Error('Unexpected test-user recipient');
  if (manifest.testUserFunding) {
    const receipt = await rpc.waitForTransaction(manifest.testUserFunding.hash, 2, 120000);
    if (!receipt || receipt.status !== 1) throw new Error('Existing test-user funding not confirmed');
  } else {
    const balance = await rpc.getBalance(manifest.testUser);
    if (balance < parseEther('0.01')) {
      const fees = await rpc.getFeeData();
      if (!fees.maxFeePerGas || fees.maxFeePerGas * 21000n > parseEther('0.001')) throw new Error('Funding fee ceiling exceeded');
      const transaction = await signer.sendTransaction({ to: manifest.testUser, value: parseEther('0.01') - balance, gasLimit: 21000n });
      manifest.testUserFunding = { hash: transaction.hash, valueWei: transaction.value.toString() };
      await save();
      const receipt = await transaction.wait(2);
      if (receipt.status !== 1) throw new Error('Funding failed');
    }
  }
}
console.log(JSON.stringify({ tokens: manifest.tokens, testUserBalanceWei: (await rpc.getBalance(manifest.testUser)).toString() }));
