import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { Contract, Interface, JsonRpcProvider } from 'ethers';

// One new, deliberately non-restartable public owner flow. Reconcile any incomplete
// journal and chain receipts before allowing another financial run.
const execute = process.argv.includes('--execute');
const resume = process.argv.includes('--resume');
if (resume && !execute) throw new Error('Resume requires --execute');
if (process.argv.some(arg => arg.startsWith('--') && !['--execute', '--resume'].includes(arg))) throw new Error('Unknown argument');
const label = 'jury-flow-20260926';
const appUrl = 'https://agent-capital-tree.vercel.app';
const privateBase = join(homedir(), '.agent-capital-tree');
const profile = join(privateBase, 'browser', 'jury-e2e');
const extension = join(privateBase, 'tools', 'metamask-13.49.0');
const runtimeRoot = join(privateBase, label, 'runtime');
const configPath = join(privateBase, label, 'config.json');
const reportUrl = new URL('../deployments/usdc-jury-owner.json', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('../deployments/usdc-sepolia.json', import.meta.url), 'utf8'));
const controller = manifest.contracts.CapitalController.address;
const usdc = manifest.tokens[0].address;
const quote = manifest.tokens[1].address;
const namespaceExpiry = BigInt(manifest.ensNamespace.expiry);
const poolId = manifest.uniswap.poolId;
const owner = `0x${JSON.parse(await readFile(join(privateBase, 'keys/jury-e2e.keystore.json'), 'utf8')).address}`;
const controllerAbi = new Interface(JSON.parse(await readFile(new URL('../contracts/out/CapitalController.sol/CapitalController.json', import.meta.url), 'utf8')).abi);
const erc20Abi = new Interface(['function approve(address spender,uint256 amount)', 'function balanceOf(address owner) view returns(uint256)', 'function allowance(address owner,address spender) view returns(uint256)', 'event Approval(address indexed owner,address indexed spender,uint256 value)']);
const delegationAbi = new Interface(['function redeemDelegations(bytes[] permissionContexts,bytes32[] modes,bytes[] executionCalldatas)']);
const rpc = new JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
const capabilities = (1n << 40n) | (1n << 44n) | (1n << 68n);
const assertAddress = (actual, expected) => assert.equal(actual.toLowerCase(), expected.toLowerCase());
const assertPolicy = (policy, expiry) => {
  assert.equal(policy.capabilities, capabilities);
  assert.deepEqual([...policy.maxAmounts], [10000000n, 10000000n]);
  assert.equal(policy.expiry, expiry);
  assert.equal(policy.tokenMask, 3n);
  assert.equal(policy.poolId.toLowerCase(), poolId.toLowerCase());
};
const save = report => writeFile(reportUrl, `${JSON.stringify(report, null, 2)}\n`);

assert.equal(manifest.chainId, 11155111);
assert.equal(manifest.status, 'deployed');
assert.equal(manifest.tokens[0].symbol, 'USDC');
assert.equal(manifest.tokens[0].decimals, 6);
assertAddress(usdc, '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238');
assert.equal(manifest.tokens[1].symbol, 'DEMO-USD');
assert.equal(manifest.tokens[1].decimals, 6);
assert.equal(manifest.tokens[1].valueless, true);
const published = await (await fetch(`${appUrl}/api/deployment`, { signal: AbortSignal.timeout(15000) })).json();
assertAddress(published.controllerAddress, controller);
assertAddress(published.tokenAddresses[0], usdc);
assertAddress(published.tokenAddresses[1], quote);
assert.equal(published.poolId.toLowerCase(), poolId.toLowerCase());
assert.equal(published.namespaceName, manifest.ensNamespace.name);
assert.equal((await rpc.getNetwork()).chainId, 11155111n);
assert((await new Contract(usdc, erc20Abi, rpc).balanceOf(owner)) >= 10000000n, 'Owner needs at least 10 USDC');
assert((await rpc.getBalance(owner)) > 10000000000000000n, 'Owner needs Sepolia gas');
let previous;
try { previous = JSON.parse(await readFile(reportUrl, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (Boolean(previous) !== resume) throw new Error(previous ? 'Jury report already exists; use reviewed --resume only' : 'No jury report to resume');
if (resume) {
  assert.equal(previous.status, 'incomplete');
  assert.equal(previous.transactions.length, 1);
  assert.equal(previous.transactions[0].phase, 'create');
  assert.equal(previous.transactions[0].functionName, 'createRoot');
  assert(/^0x[0-9a-fA-F]{64}$/.test(previous.transactions[0].transactionHash));
  assertAddress(previous.controller, controller);
  assertAddress(previous.owner, owner);
  assert.equal(previous.label, label);
  assert.equal(previous.fundingRaw, '10000000');
}
if (!execute) {
  console.log(JSON.stringify({ status: 'ready', financialWrites: false, owner, controller, token: usdc, label, runtimeRoot }));
  rpc.destroy();
  process.exit(0);
}

let virtualDisplay;
let display = process.env.DISPLAY;
if (!display) {
  virtualDisplay = spawn('Xvfb', ['-displayfd', '1', '-screen', '0', '1440x1000x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const number = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { virtualDisplay.kill(); reject(new Error('Display startup timed out')); }, 5000);
    virtualDisplay.once('error', () => { clearTimeout(timer); reject(new Error('Display unavailable')); });
    virtualDisplay.stdout.once('data', chunk => { clearTimeout(timer); resolve(chunk.toString().trim()); });
  });
  assert(/^\d+$/.test(number));
  display = `:${number}`;
}
let context;
let report;
let stage = 'wallet';
let phase = 'create';
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: false,
    env: { ...process.env, DISPLAY: display },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.setDefaultTimeout(30000);
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const origin = `chrome-extension://${new URL(worker.url()).host}`;
  const wallet = context.pages().find(page => page.url().startsWith(origin)) ?? await context.newPage();
  await wallet.goto(`${origin}/home.html`);
  await Promise.any(['unlock-submit', 'account-menu-icon'].map(id => wallet.getByTestId(id).waitFor({ timeout: 60000 })));
  if (await wallet.getByTestId('unlock-submit').isVisible()) {
    await wallet.locator('input[type="password"]').fill(await readFile(join(privateBase, 'keys/jury-e2e.password'), 'utf8'));
    await wallet.getByTestId('unlock-submit').click();
  }
  await wallet.getByTestId('account-menu-icon').waitFor({ timeout: 60000 });
  const app = await context.newPage();
  await app.goto(`${appUrl}/setup`);
  await app.waitForFunction(() => Boolean(window.ethereum));
  if (!(await app.evaluate(() => window.ethereum.request({ method: 'eth_accounts' }))).length) {
    await app.getByRole('button', { name: 'Connect wallet', exact: true }).click();
    const consent = await walletPopup(context, origin, /^(Connect|Connect anyway|Continue at your own risk)$/);
    if (await consent.getByRole('button', { name: /^(Connect anyway|Continue at your own risk)$/ }).count()) throw new Error('MetaMask safety warning');
    await consent.getByRole('button', { name: 'Connect', exact: true }).click();
  }
  await app.locator('.wallet-address').waitFor();
  if (await app.getByRole('button', { name: 'Switch to Sepolia', exact: true }).isVisible()) {
    await app.getByRole('button', { name: 'Switch to Sepolia', exact: true }).click();
    const consent = await walletPopup(context, origin, /^(Confirm|Switch network)$/);
    assert(await consent.getByText('Sepolia', { exact: false }).count());
    await consent.getByRole('button', { name: /^(Confirm|Switch network)$/ }).click();
  }
  await app.getByLabel('Connected to Sepolia').waitFor();
  assertAddress((await app.evaluate(() => window.ethereum.request({ method: 'eth_accounts' })))[0], owner);
  assert.equal(await app.evaluate(() => window.ethereum.request({ method: 'eth_chainId' })), '0xaa36a7');
  stage = 'create';
  const date = resume ? new Date(Number(previous.policyExpiry) * 1000).toISOString().slice(0, 10)
    : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const expiry = BigInt(Math.floor(Date.parse(`${date}T23:59:59.000Z`) / 1000));
  assert(expiry > BigInt(Math.floor(Date.now() / 1000)) && expiry < namespaceExpiry);
  report = previous ?? { status: 'running', chainId: 11155111, appUrl, owner, controller, label, namespace: manifest.ensNamespace.name,
    usdc, quote, policyExpiry: expiry.toString(), fundingRaw: '10000000', runtimeRoot, transactions: [], startedAt: new Date().toISOString() };
  if (resume) assert.equal(report.policyExpiry, expiry.toString());
  else await writeFile(reportUrl, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  const pending = report.transactions;
  await app.exposeFunction('actReviewUnsigned', async tx => {
    assertAddress(tx.from, owner);
    assert.equal(BigInt(tx.value ?? 0), 0n);
    const to = tx.to.toLowerCase();
    const parsed = (to === controller.toLowerCase() ? controllerAbi : erc20Abi).parseTransaction({ data: tx.data });
    assert(parsed, 'Unknown transaction');
    if (phase === 'create') {
      assertAddress(to, controller);
      assert.equal(parsed.name, 'createRoot');
      assert.equal(parsed.args[0], label);
      assertPolicy(parsed.args[1], expiry);
    } else if (phase === 'fund') {
      if (to === usdc.toLowerCase()) {
        assert.equal(parsed.name, 'approve');
        assertAddress(parsed.args[0], controller);
        assert.equal(parsed.args[1], 10000000n);
      } else {
        assertAddress(to, controller);
        assert.equal(parsed.name, 'fundRoot');
        assert.equal(parsed.args[0].toString(), report.rootId);
        assert.deepEqual([...parsed.args[1]], [10000000n, 0n]);
      }
    } else if (phase === 'bind') {
      assertAddress(to, controller);
      assert.equal(parsed.name, 'setRootOperator');
      assert.equal(parsed.args[0].toString(), report.rootId);
      assertAddress(parsed.args[1], report.operator);
      assertPolicy(parsed.args[2], expiry);
    } else throw new Error('Unexpected financial write phase');
    const transaction = { phase, functionName: parsed.name, to: tx.to, calldata: tx.data, status: 'awaiting-wallet' };
    pending.push(transaction);
    await save(report);
    return pending.length - 1;
  });
  await app.exposeFunction('actRecordHash', async (index, hash) => {
    assert(/^0x[0-9a-fA-F]{64}$/.test(hash));
    pending[index].transactionHash = hash;
    pending[index].status = 'submitted';
    await save(report);
  });
  const instrument = () => app.evaluate(() => {
    if (window.ethereum.__actObserved) return;
    const original = window.ethereum.request.bind(window.ethereum);
    window.ethereum.request = async args => {
      if (args.method !== 'eth_sendTransaction') return original(args);
      const index = await window.actReviewUnsigned(args.params[0]);
      const hash = await original(args);
      await window.actRecordHash(index, hash);
      return hash;
    };
    window.ethereum.__actObserved = true;
  });
  const confirmUntil = async done => {
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      if (await app.locator('.wallet-action-notice-error:visible, .wallet-form-error:visible').count()) throw new Error(`${phase} form failed`);
      if (await done()) return;
      const next = pending.find(item => item.status === 'awaiting-wallet');
      if (next) {
        const popup = await walletPopup(context, origin, /^Confirm$/);
        if (await popup.getByRole('button', { name: /^(Confirm anyway|Connect anyway|Continue at your own risk)$/ }).count()) throw new Error('MetaMask safety warning');
        next.status = 'wallet-confirmed';
        await save(report);
        await popup.getByRole('button', { name: 'Confirm', exact: true }).click();
        await app.bringToFront();
      }
      await app.waitForTimeout(750);
    }
    throw new Error(`${phase} confirmation timed out`);
  };
  const receipt = async tx => {
    const mined = await rpc.waitForTransaction(tx.transactionHash, 1, 120000);
    assert(mined && mined.status === 1);
    assertAddress(mined.from, owner);
    const raw = await rpc.getTransaction(tx.transactionHash);
    assert(raw && raw.hash === tx.transactionHash);
    assertAddress(raw.from, owner);
    assert.equal(raw.value, 0n);
    if (raw.to.toLowerCase() === tx.to.toLowerCase()) assert.equal(raw.data.toLowerCase(), tx.calldata.toLowerCase());
    else {
      // The existing MetaMask owner account is EIP-7702 delegated. Its reviewed
      // eth_sendTransaction can be packaged into this observed execution wrapper.
      assertAddress(raw.to, '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3');
      assert((await rpc.getCode(owner)).toLowerCase().startsWith('0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b'));
      const redeemed = delegationAbi.parseTransaction({ data: raw.data });
      assert.equal(redeemed?.name, 'redeemDelegations');
      assert.equal(redeemed.args.permissionContexts.length, 1);
      assert.deepEqual([...redeemed.args.modes], [`0x${'00'.repeat(32)}`]);
      assert.deepEqual([...redeemed.args.executionCalldatas], [
        `${tx.to.toLowerCase()}${'00'.repeat(32)}${tx.calldata.slice(2).toLowerCase()}`,
      ]);
    }
    const logs = mined.logs.filter(log => log.address.toLowerCase() === tx.to.toLowerCase());
    const parsed = logs.map(log => { try { return (tx.functionName === 'approve' ? erc20Abi : controllerAbi).parseLog(log); } catch { return null; } }).filter(Boolean);
    if (tx.functionName === 'createRoot') assert(parsed.some(event => event.name === 'NodeCreated' && event.args.parentId === 0n));
    if (tx.functionName === 'approve') assert(parsed.some(event => event.name === 'Approval' && event.args.owner.toLowerCase() === owner.toLowerCase() && event.args.spender.toLowerCase() === controller.toLowerCase() && event.args.value === 10000000n));
    if (tx.functionName === 'fundRoot') assert(parsed.some(event => event.name === 'RootFunded' && event.args.rootId.toString() === report.rootId && event.args.token.toLowerCase() === usdc.toLowerCase() && event.args.amount === 10000000n));
    if (tx.functionName === 'setRootOperator') assert(parsed.some(event => event.name === 'OperatorChanged' && event.args.rootId.toString() === report.rootId && event.args.operator.toLowerCase() === report.operator.toLowerCase()));
    tx.status = 'confirmed';
    tx.blockNumber = mined.blockNumber;
    tx.blockHash = mined.blockHash;
    await save(report);
    return mined;
  };
  let createTx = pending.find(tx => tx.phase === 'create');
  if (!resume) {
    await instrument();
    await app.getByRole('button', { name: 'Launch a new root vault', exact: true }).click();
    await app.getByLabel('Root ENS label', { exact: true }).fill(label);
    await fillPolicy(app, date);
    await app.getByRole('button', { name: 'Create root vault', exact: true }).click();
    await confirmUntil(async () => pending.some(tx => tx.phase === 'create' && tx.transactionHash));
    createTx = pending.find(tx => tx.phase === 'create');
  } else {
    const priorReceipt = await rpc.getTransactionReceipt(createTx.transactionHash);
    assert(priorReceipt && priorReceipt.status === 1);
    const priorCreated = priorReceipt.logs.filter(log => log.address.toLowerCase() === controller.toLowerCase())
      .map(log => { try { return controllerAbi.parseLog(log); } catch { return null; } })
      .find(event => event?.name === 'NodeCreated' && event.args.parentId === 0n);
    assert(priorCreated, 'Prior transaction did not create a root on the current controller');
    const oldNode = await new Contract(controller, controllerAbi, rpc).getNode(priorCreated.args.rootId);
    assert.equal(oldNode.label, label);
    assertPolicy(oldNode.policy, expiry);
    createTx.calldata = controllerAbi.encodeFunctionData('createRoot', [label, oldNode.policy]);
    assertAddress(createTx.to, controller);
  }
  const createReceipt = await receipt(createTx);
  const createdLog = createReceipt.logs.find(log => log.address.toLowerCase() === controller.toLowerCase() && controllerAbi.parseLog(log)?.name === 'NodeCreated');
  assert(createdLog, 'Root creation receipt has no NodeCreated event');
  const created = controllerAbi.parseLog(createdLog);
  assert.equal(created.name, 'NodeCreated');
  assert.equal(created.args.parentId, 0n);
  report.rootId = created.args.rootId.toString();
  report.vault = created.args.vault;
  assertAddress(await new Contract(controller, controllerAbi, rpc).rootOwner(report.rootId), owner);
  report.status = 'running';
  delete report.failedStage;
  await save(report);
  await app.goto(`${appUrl}/setup?vault=${report.vault}`);
  await expect(app.getByText(`${label}.${manifest.ensNamespace.name}`, { exact: true }).first()).toBeVisible({ timeout: 60000 });
  await instrument();
  phase = 'fund'; stage = 'fund';
  await app.getByRole('button', { name: 'Fund root', exact: true }).click();
  await app.getByLabel('USDC amount', { exact: true }).fill('10');
  await app.getByLabel('DEMO-USD amount', { exact: true }).fill('0');
  await app.getByRole('button', { name: 'Approve and fund root', exact: true }).click();
  await confirmUntil(() => app.locator('.wallet-action-notice-confirmed').filter({ hasText: 'Fund root vault' }).isVisible());
  for (const tx of pending.filter(item => item.phase === 'fund')) await receipt(tx);
  assert.equal(await new Contract(usdc, erc20Abi, rpc).balanceOf(report.vault), 10000000n);
  report.funded = true; await save(report);
  phase = 'bind'; stage = 'bind';
  await mkdir(join(privateBase, label), { recursive: true, mode: 0o700 });
  await writeFile(configPath, `${JSON.stringify({ runtimeRoot, rootId: report.rootId, controller }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const prepared = await promisify(execFile)(process.execPath,
    [new URL('../packages/runtime/cli.mjs', import.meta.url).pathname, 'prepare-root', configPath],
    { maxBuffer: 1024 });
  report.operator = prepared.stdout.trim();
  assert(/^0x[0-9a-fA-F]{40}$/.test(report.operator));
  assert.deepEqual(JSON.parse(await readFile(join(runtimeRoot, 'domain.json'), 'utf8')), {
    chainId: 11155111, rootId: report.rootId, controller: controller.toLowerCase(),
  });
  await save(report);
  await app.getByRole('button', { name: 'Bind operator', exact: true }).click();
  await app.getByLabel('Root operator address', { exact: true }).fill(report.operator);
  await fillPolicy(app, date);
  await app.getByRole('button', { name: 'Set root operator', exact: true }).click();
  await confirmUntil(() => app.locator('.wallet-action-notice-confirmed').filter({ hasText: 'Set root operator' }).isVisible());
  await receipt(pending.find(tx => tx.phase === 'bind'));
  const node = await new Contract(controller, controllerAbi, rpc).getNode(report.rootId);
  assertAddress(node.vault, report.vault);
  assertAddress(node.agent, report.operator);
  assertAddress(await new Contract(controller, controllerAbi, rpc).rootOperator(report.rootId), report.operator);
  assertPolicy(node.policy, expiry);
  report.status = 'passed';
  delete report.failedStage;
  report.finishedAt = new Date().toISOString();
  await save(report);
  console.log(JSON.stringify({ status: report.status, rootId: report.rootId, vault: report.vault, operator: report.operator, transactions: report.transactions.map(tx => tx.transactionHash) }));
} catch (error) {
  if (report) {
    report.status = 'incomplete';
    report.failedStage = stage;
    report.finishedAt = new Date().toISOString();
    await save(report);
  }
  console.error(JSON.stringify({ status: 'failed', stage, reason: error?.name === 'AssertionError' ? 'assertion' : error?.name === 'TimeoutError' ? 'timeout' : 'action', reconcileBeforeRetry: Boolean(report) }));
  process.exitCode = 1;
} finally {
  await context?.close();
  virtualDisplay?.kill();
  rpc.destroy();
}

async function walletPopup(context, origin, buttonName) {
  const deadline = Date.now() + 60000;
  const fallbackAt = Date.now() + 3000;
  let opened = false;
  while (Date.now() < deadline) {
    for (const page of context.pages().filter(candidate => candidate.url().startsWith(origin))) {
      if (await page.getByRole('button', { name: buttonName }).first().isVisible().catch(() => false)) return page;
    }
    if (!opened && Date.now() >= fallbackAt) {
      const page = await context.newPage();
      await page.goto(`${origin}/notification.html`, { waitUntil: 'domcontentloaded' });
      opened = true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('No wallet consent screen appeared');
}

async function fillPolicy(app, date) {
  await app.getByLabel('Maximum USDC per action', { exact: true }).fill('10');
  await app.getByLabel('Maximum DEMO-USD per action', { exact: true }).fill('10');
  await app.getByLabel('Policy expires', { exact: true }).fill(date);
  for (const label of await app.locator('.wallet-permission-fields label').all()) {
    const name = await label.textContent();
    if (['Delegate capital', 'Swap assets', 'Companion x402 payment'].includes(name.trim())) await label.locator('input').check();
    else await label.locator('input').uncheck();
  }
}
