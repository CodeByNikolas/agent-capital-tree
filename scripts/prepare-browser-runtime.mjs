import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Contract, JsonRpcProvider, Wallet, parseEther } from 'ethers';
import { WorkerKeyStore } from '../packages/runtime/dist/index.js';
import { journaledTransaction } from './lib/sepolia-transactions.mjs';

// Fund only the operator verified by the completed real browser onboarding.
const execute = process.argv.includes('--execute');
assert(process.argv.slice(2).every(arg => arg === '--execute'));
const base = join(homedir(), '.agent-capital-tree');
const runtimeRoot = join(base, 'browser-runtime');
const owner = JSON.parse(await readFile(new URL('../deployments/browser-owner-e2e.json', import.meta.url)));
const manifest = JSON.parse(await readFile(new URL('../deployments/sepolia.json', import.meta.url)));
const controllerAbi = JSON.parse(await readFile(new URL('../contracts/out/CapitalController.sol/CapitalController.json', import.meta.url))).abi;
const rpcUrl = 'https://ethereum-sepolia.publicnode.com';
const rpc = new JsonRpcProvider(rpcUrl);
try {
  assert.equal(owner.status, 'owner-setup-passed', 'Complete browser owner onboarding first');
  assert.equal(owner.controller, manifest.contracts.CapitalController.address);
  assert.equal((await rpc.getNetwork()).chainId, 11155111n);
  const controller = new Contract(owner.controller, controllerAbi, rpc);
  assert.equal((await controller.rootOwner(owner.rootId)).toLowerCase(), owner.owner.toLowerCase());
  assert.equal((await controller.rootOperator(owner.rootId)).toLowerCase(), owner.operator.toLowerCase());
  assert.equal((await new WorkerKeyStore(join(runtimeRoot, 'keys')).account(`root-${owner.rootId}`)).address.toLowerCase(), owner.operator.toLowerCase());
  const grant = parseEther('0.032');
  const fee = (await rpc.getFeeData()).maxFeePerGas;
  assert(fee && grant >= parseEther('0.018') + 6_500_000n * fee, 'Funding target cannot cover current spawn reservation');
  console.log(JSON.stringify({ mode: execute ? 'execute' : 'inspect', rootId: owner.rootId, operator: owner.operator,
    operatorGasWei: (await rpc.getBalance(owner.operator)).toString(), totalPlannedGrantWei: grant.toString() }));
  if (execute) {
    const deployer = (await Wallet.fromEncryptedJson(await readFile(join(base, 'keys/deployer.keystore.json'), 'utf8'),
      await readFile(join(base, 'keys/deployer.password'), 'utf8'))).connect(rpc);
    assert.equal(deployer.address, manifest.deployer);
    const report = { rootId: owner.rootId, operator: owner.operator, totalGrantWei: grant.toString(), transactions: [] };
    for (const [i, amount] of ['0.01', '0.01', '0.01', '0.002'].entries()) {
      const { receipt } = await journaledTransaction({ rpc, signer: deployer,
        directory: join(base, 'browser-runtime-funding'), name: `root-${owner.rootId}-gas-${i}`,
        request: { to: owner.operator, value: parseEther(amount) } });
      report.transactions.push({ transactionHash: receipt.hash, blockNumber: receipt.blockNumber, amount });
      await writeFile(new URL('../deployments/browser-runtime-funding.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
    }
    const config = { runtimeRoot, rootId: owner.rootId, rpcUrl, controller: owner.controller,
      upstream: 'http://100.91.160.81:8317/v1',
      imageId: 'sha256:e18863655ebc0b6daf3b4ebb87851d1ffc8504db7c497bc0252fa9d07ca874b0',
      models: ['gpt-6-luna', 'gpt-6-sol'], childGasWei: parseEther('0.018').toString() };
    const encoded = JSON.stringify(config, null, 2) + '\n';
    const path = join(base, 'browser-runtime.config.json');
    try { await writeFile(path, encoded, { mode: 0o600, flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST' || await readFile(path, 'utf8') !== encoded) throw error; }
  }
} finally { rpc.destroy(); }
