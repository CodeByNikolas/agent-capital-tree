// Idempotent Sepolia demo extension. Inspect first; --execute uses only existing demo capital.
import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Contract, JsonRpcProvider, Wallet, id, parseEther } from 'ethers';
import { WorkerKeyStore } from '../packages/runtime/dist/index.js';
import { financeRoles as roles } from '../packages/sdk/dist/index.js';
import { journaledTransaction } from './lib/sepolia-transactions.mjs';

assert.ok(process.argv.slice(2).every(arg => arg === '--execute'));
const execute = process.argv.includes('--execute');
const manifest = JSON.parse(await readFile(new URL('../deployments/usdc-sepolia.json', import.meta.url), 'utf8'));
const reportPath = new URL('../deployments/kanoki-demo-e2e.json', import.meta.url);
const rpc = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
const rootId = 1n;
const address = manifest.contracts.CapitalController.address;
const directory = join(homedir(), '.agent-capital-tree/kanoki-demo-e2e', address);
const artifact = JSON.parse(await readFile(new URL('../contracts/out/CapitalController.sol/CapitalController.json', import.meta.url), 'utf8'));
const controller = new Contract(address, artifact.abi, rpc);
const json = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2) + '\n';
const rejectedByContract = error => error.code === 'CALL_EXCEPTION' && typeof error.data === 'string' && error.data !== '0x';
try {
  assert.equal((await rpc.getNetwork()).chainId, 11155111n);
  assert.equal(manifest.ensNamespace.name, 'kanoki.eth');
  assert.equal(address.toLowerCase(), '0xeb2041b486d66ab91140ffcf54b66513d8ec40c8');
  const root = await controller.getNode(rootId);
  assert.equal(root.label, 'capital');
  assert.equal(root.revoked, false);
  assert.equal((await controller.rootOwner(rootId)).toLowerCase(), manifest.deployer.toLowerCase());
  assert.equal(root.agent.toLowerCase(), manifest.deployer.toLowerCase());
  const tokens = manifest.tokens.map(token => new Contract(token.address, ['function balanceOf(address) view returns(uint256)'], rpc));
  const balances = await Promise.all(tokens.map(token => token.balanceOf(root.vault)));
  if (!execute) {
    console.log(json({ mode: 'inspect', controller: address, root: root.vault, balances,
      allocations: { trader: ['250000', '250000'], liquidity: ['300000', '300000'], nestedRiskVaultFromTrader: ['50000', '50000'] },
      swapInput: '10000', swapMinimumOutput: '9500', maximumGasBudgetETH: '0.025', additionalTokenFunding: false }));
  } else {
    const payment = JSON.parse(await readFile(new URL('../deployments/kanoki-payment.json', import.meta.url), 'utf8'));
    assert.equal(payment.status, 'confirmed');
    assert.equal(payment.controller.toLowerCase(), address.toLowerCase());
    const keysPath = join(homedir(), '.agent-capital-tree/keys');
    const owner = (await Wallet.fromEncryptedJson(await readFile(join(keysPath, 'jury-e2e.keystore.json'), 'utf8'), await readFile(join(keysPath, 'jury-e2e.password'), 'utf8'))).connect(rpc);
    assert.equal(owner.address.toLowerCase(), root.agent.toLowerCase());
    let report;
    try { report = JSON.parse(await readFile(reportPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!report) {
      assert.ok(balances[0] >= 550000n && balances[1] >= 550000n);
      report = { status: 'running', controller: address, rootId: String(rootId), startedAt: new Date().toISOString(), deadline: String((await rpc.getBlock('latest')).timestamp + 7200), transactions: {}, checks: {}, nodes: {}, payment: payment.payment,
        limitations: ['Real Sepolia test-token transactions; no real-dollar valuation.', 'Vault operators are separate local keys. This scenario does not launch autonomous model workers.', 'x402 uses a controlled local research seller; payments are verified from USDC receipts, separately from MultiBaas controller events.'] };
      await writeFile(reportPath, json(report), { flag: 'wx' });
    }
    assert.equal(report.controller.toLowerCase(), address.toLowerCase());
    const save = () => writeFile(reportPath, json(report));
    const store = new WorkerKeyStore(join(directory, 'keys'));
    const wallets = {};
    for (const label of ['trader', 'liquidity', 'risk-check']) wallets[label] = (await store.wallet(label, !report.nodes[label])).connect(rpc);
    const effective = await controller.getEffectivePolicy(rootId);
    const generation = await controller.rootGeneration(rootId);
    const deadline = BigInt(report.deadline);
    const maxBudget = parseEther('0.025');
    async function send(name, signer, request) {
      const journalExists = await access(join(directory, 'transactions', name + '.json')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
      if (!report.transactions[name] && !journalExists) {
        const fees = await rpc.getFeeData();
        const cost = (await rpc.estimateGas({ ...request, from: signer.address })) * 12n / 10n * fees.maxFeePerGas;
        const spent = Object.values(report.transactions).reduce((sum, tx) => sum + BigInt(tx.gasCostWei), 0n);
        // Gas grants move funds between this demo's signers; counting the grant and its later gas would double count.
        assert.ok(spent + cost <= maxBudget, 'Demo gas budget exceeded');
        assert.ok(await rpc.getBalance(signer.address) >= cost + BigInt(request.value ?? 0), 'Signer gas reserve is too small');
      }
      const { receipt } = await journaledTransaction({ rpc, signer, directory: join(directory, 'transactions'), name, request, maxGasCostWei: parseEther('0.012') });
      report.transactions[name] = { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, gasCostWei: String(receipt.gasUsed * receipt.gasPrice), valueWei: String(request.value ?? 0) };
      await save();
      return receipt;
    }
    const policy = (capabilities, amount) => ({ capabilities, maxAmounts: [amount, amount], expiry: effective.expiry, tokenMask: 3, poolId: effective.poolId });
    const traderPolicy = policy(roles.swap | roles.delegate | roles.restrict | roles.reclaim, 250000n);
    const liquidityPolicy = policy(roles.lpManage | roles.collectFees | roles.exit, 300000n);
    const riskPolicy = policy(roles.swap, 50000n);
    async function spawn(parentId, signer, label, mandate, amounts) {
      const operationKey = id(`kanoki-public-demo-${label}-v1`);
      await send(`spawn-${label}`, signer, await controller.connect(signer).spawnChild.populateTransaction(parentId, label, wallets[label].address, mandate, amounts, operationKey));
      const operation = await controller.getOperation(rootId, parentId, generation, operationKey);
      assert.ok(operation.nodeId > 0n);
      const node = await controller.getNode(operation.nodeId);
      assert.equal(node.agent.toLowerCase(), wallets[label].address.toLowerCase());
      report.nodes[label] = { id: String(node.id), parentId: String(parentId), vault: node.vault, operator: node.agent };
      await save();
      return node.id;
    }
    const trader = await spawn(rootId, owner, 'trader', traderPolicy, [250000n, 250000n]);
    const liquidity = await spawn(rootId, owner, 'liquidity', liquidityPolicy, [300000n, 300000n]);
    for (const label of ['trader', 'liquidity']) await send(`gas-${label}`, owner, { to: wallets[label].address, value: parseEther(label === 'trader' ? '0.009' : '0.002') });
    const risk = await spawn(trader, wallets.trader, 'risk-check', riskPolicy, [50000n, 50000n]);
    const lpController = controller.connect(wallets.liquidity);
    await send('open-liquidity', wallets.liquidity, await lpController.openPosition.populateTransaction(liquidity, 3000000n, [150000n, 150000n], deadline));
    const swap = await send('swap-trader', wallets.trader, await controller.connect(wallets.trader).swap.populateTransaction(trader, true, 10000n, 9500n, 4295128740n, deadline));
    const swapEvent = swap.logs.map(log => { try { return controller.interface.parseLog(log); } catch { return null; } }).find(log => log?.name === 'SwapExecuted');
    assert.equal(swapEvent.args.amountIn, 10000n);
    assert.ok(swapEvent.args.amountOut >= 9500n);
    await send('collect-liquidity-fees', wallets.liquidity, await lpController.collectFees.populateTransaction(liquidity, [0n, 0n], deadline));
    await send('tighten-risk-policy', wallets.trader, await controller.connect(wallets.trader).tightenPolicy.populateTransaction(risk, policy(roles.swap, 20000n)));
    await assert.rejects(controller.connect(wallets.trader).swap.staticCall(trader, true, 250001n, 1n, 4295128740n, deadline), rejectedByContract);
    await assert.rejects(controller.connect(wallets.liquidity).swap.staticCall(liquidity, true, 1000n, 1n, 4295128740n, deadline), rejectedByContract);
    await assert.rejects(controller.connect(owner).spawnChild.staticCall(trader, 'unauthorized-child', owner.address, riskPolicy, [0n, 0n], id('kanoki-negative-owner-as-agent')), rejectedByContract);
    assert.equal((await controller.getEffectivePolicy(risk)).maxAmounts[0], 20000n);
    assert.equal(await tokens[0].balanceOf(report.nodes.trader.vault), 190000n);
    const lpVault = new Contract(report.nodes.liquidity.vault, ['function positionTokenId() view returns(uint256)', 'function positionLiquidity() view returns(uint128)'], rpc);
    assert.equal(await lpVault.positionLiquidity(), 3000000n);
    assert.ok(await lpVault.positionTokenId() > 0n);
    assert.equal(await controller.rootNodeCount(rootId), 5n);
    report.checks = { separateOperators: new Set(Object.values(wallets).map(w => w.address)).size === 3, threeLevelTree: true, nodeCount: 5, swapConfirmed: true, lpTokenId: String(await lpVault.positionTokenId()), overBudgetRejected: true, wrongCapabilityRejected: true, wrongOperatorRejected: true, nestedPolicyTightened: true, x402PaymentConfirmed: true };
    report.status = 'confirmed'; report.checkedAt = new Date().toISOString(); await save();
    console.log(json({ status: report.status, checks: report.checks, transactions: report.transactions }));
  }
} finally { rpc.destroy(); }
