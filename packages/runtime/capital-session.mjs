// A root switch is explicit and serialized by the STDIO entrypoint. Reads never select a signer.
import { access, lstat, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve, relative } from 'node:path';
import { WorkerKeyStore, prepareRootOperator, capitalReadiness } from './dist/index.js';
import { openWalletBrowser } from '../../scripts/open-wallet-browser.mjs';
import { CapitalOnboarding } from './capital-onboarding.mjs';

const ZERO = '0x0000000000000000000000000000000000000000';
export class SetupError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.code = code; }
}
export function safeCapitalError(error) {
  if (error instanceof SetupError) return error.message;
  if (error?.message?.startsWith('ROOT_REVOKED:')) return 'ROOT_REVOKED: Your saved vault is permanently revoked. No replacement, key change or funding was requested.';
  if (error?.code === 'INSUFFICIENT_GAS') return 'INSUFFICIENT_GAS: Local signer has insufficient native Sepolia ETH for the simulated child transaction. No transaction was submitted. Fund native gas, not USDC.';
  if (/^No vault in this Sepolia deployment|^Root not found/.test(error?.message ?? '')) return 'ROOT_NOT_FOUND: No confirmed root matches this identifier at the observed block. If you just signed creation, wait for its receipt; pending status is not known to this MCP.';
  if (/^Enter a positive root ID/.test(error?.message ?? '')) return 'INVALID_ROOT: Use a positive root ID, full kanoki.eth name or vault address.';
  if (/^Expected Ethereum Sepolia/.test(error?.message ?? '')) return 'WRONG_CHAIN: Only Ethereum Sepolia (11155111) is supported.';
  return 'RPC_OR_RUNTIME_UNAVAILABLE: No confirmed result. The provider or local runtime could not complete the request. For a write, reconcile the SAME operationKey before retrying; never assume a timeout means failure.';
}
export async function privatePath(path, mode, directory = false) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== mode ||
    (directory ? !info.isDirectory() : !info.isFile())) throw new SetupError('UNSAFE_PROFILE', 'Private Linux profile permissions or ownership are invalid. No key was replaced.');
  return path;
}

export class CapitalSession {
  constructor({ client, controller, base, repo, query, explicitRoot, writesEnabled, namespace = 'kanoki.eth', walletOrigin = 'https://kanoki-app.vercel.app', closeRuntime = async () => {} }) {
    Object.assign(this, { client, controller, base, repo, query, explicitRoot, writesEnabled, namespace, walletOrigin, closeRuntime });
    this.onboarding = new CapitalOnboarding(this);
  }
  async matchingDomain(path, rootId) {
    try {
      await privatePath(path, 0o700, true);
      const domain = JSON.parse(await readFile(await privatePath(join(path, 'domain.json'), 0o600), 'utf8'));
      return domain.chainId === 11155111 && domain.rootId === rootId && domain.controller === this.controller.toLowerCase();
    } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  async profile(rootId) {
    const candidates = [];
    if (!this.explicitRoot) {
      for (const entry of await readdir(this.base, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
        if (!entry.isDirectory()) continue;
        const candidate = join(this.base, entry.name);
        // Tool downloads and deployment journals are not signing profiles.
        try { await lstat(join(candidate, 'domain.json')); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (await this.matchingDomain(candidate, rootId)) candidates.push(candidate);
      }
      if (candidates.length > 1) throw new SetupError('AMBIGUOUS_PROFILE', 'Multiple matching profiles. Select the existing profile with --runtime-root; no key was replaced.');
    }
    const path = this.explicitRoot ?? candidates[0] ?? join(this.base, `capital-${this.controller.toLowerCase()}-${rootId}`);
    if (!isAbsolute(path) || !relative(this.repo, resolve(path)).startsWith('..') || path.startsWith('/mnt/')) throw new SetupError('UNSAFE_PROFILE', 'Use private Linux storage outside the repository and Windows mounts.');
    if (this.explicitRoot && !await this.matchingDomain(path, rootId)) {
      // A brand new explicit profile is allowed; an existing domain is never repurposed.
      try { await access(join(path, 'domain.json')); throw new SetupError('PROFILE_MISMATCH', 'Explicit profile belongs to another root. Preserve it and select the matching profile.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return path;
  }
  async select(query) {
    const resolved = await this.client.resolveTree(query);
    if (resolved.selectedNodeId !== resolved.tree.rootId) throw new SetupError('NOT_A_ROOT', 'Select the root ENS or root vault, not a child.');
    const rootId = String(resolved.tree.rootId), runtimeRoot = await this.profile(rootId);
    await this.closeRuntime();
    Object.assign(this, { rootId, runtimeRoot, query });
    return this.inspect('100000', resolved.tree);
  }
  async initialize() {
    if (!this.rootId && !this.query) await this.onboarding.resume();
    if (!this.rootId && !this.query) throw new SetupError('ROOT_NOT_SELECTED', 'Select an active root with selectCapitalRoot, or prepare a new root with prepareRootSetup and confirm it in your wallet first.');
    if (!this.rootId) await this.select(this.query);
  }
  async policy(nodeId) {
    if (!/^[1-9]\d*$/.test(String(nodeId))) throw new SetupError('INVALID_NODE', 'Use a positive numeric nodeId from getTree.');
    await this.initialize();
    const tree = await this.client.getTree(BigInt(this.rootId));
    const node = tree.nodes.find(item => String(item.id) === String(nodeId));
    if (!node) throw new SetupError('NODE_NOT_IN_ACTIVE_ROOT', `Node is not in active root #${this.rootId}. Select the intended root explicitly before reading its policy.`);
    return { ...node.effectivePolicy, nodeId: node.id, rootId: tree.rootId,
      controller: this.controller, activeMcpRootId: this.rootId, revoked: Boolean(node.revoked),
      authorizedActions: node.authorizedActions, source: tree.source };
  }
  async localOperator(rootId = this.rootId, path = this.runtimeRoot) {
    const file = join(path, 'keys', `root-${rootId}.keystore.json`);
    try { await access(file); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
    if (!await this.matchingDomain(path, rootId)) throw new SetupError('PROFILE_MISMATCH', 'Private profile does not match the requested root.');
    return (await new WorkerKeyStore(join(path, 'keys')).account(`root-${rootId}`, false)).address;
  }
  async inspect(budgetRaw = '100000', tree) {
    if (!this.rootId && !this.query) await this.onboarding.resume();
    if (!this.rootId && !this.query) return { status: 'unavailable', mode: 'capital', activeMcpRootId: null,
      controller: this.controller, namespace: this.namespace, writesEnabled: this.writesEnabled, writeReady: false,
      localOperator: null, backgroundWorker: 'not_requested', transactionSubmitted: false,
      next: 'Call prepareRootSetup to start or resume the single wallet setup. Do not ask the user for an ENS name or manual configuration. After wallet confirmation, call getCapitalSetup again; the root and local signer are recognized automatically.' };
    await this.initialize();
    tree ??= await this.client.getTree(BigInt(this.rootId));
    const local = await this.localOperator();
    // Never display the wallet owner's gas as gas available to a missing local signer.
    const gas = local ? await this.client.rpc.getBalance({ address: local, blockNumber: tree.source.blockNumber }) : 0n;
    const setup = capitalReadiness(tree, local, gas, BigInt(budgetRaw));
    return { ...setup, controller: this.controller, authorityGeneration: tree.generation, namespace: this.namespace, activeMcpRootId: this.rootId, writesEnabled: this.writesEnabled,
      writeReady: this.writesEnabled && setup.prerequisitesMet, readinessScope: 'Setup prerequisites only; each action still requires a fresh policy, balance, simulation and fee check.',
      localProfile: this.runtimeRoot, toolVersion: 'capital-demo-2', backgroundWorker: 'not_requested',
      budgetMeaning: 'Shared tree capital, not a per-child allowance. Internal delegations are not deposits. The demo input cap is not an onchain balance cap.' };
  }
  async tree(query) {
    if (!this.rootId && !this.query) {
      const resolved = await this.client.resolveTree(query);
      return { ...resolved.tree, selectedNodeId: resolved.selectedNodeId, mcp: {
        activeMcpRootId: null, viewedRootId: String(resolved.tree.rootId), controller: this.controller,
        targetMatches: false, writeReady: false, localOperator: null,
        next: 'Reading a root does not select it. Use selectCapitalRoot before setup or writes.' } };
    }
    await this.initialize();
    const resolved = await this.client.resolveTree(query);
    const matches = String(resolved.tree.rootId) === this.rootId;
    // The annotated setup and image use exactly the tree's snapshot, never a second tree read.
    const setup = matches ? await this.inspect('100000', resolved.tree) : null;
    const activeSigner = matches ? null : await this.localOperator();
    const activeGas = activeSigner ? await this.client.rpc.getBalance({address:activeSigner,blockNumber:resolved.tree.source.blockNumber}) : null;
    return { ...resolved.tree, selectedNodeId: resolved.selectedNodeId,
      mcp: setup ?? { activeMcpRootId: this.rootId, viewedRootId: String(resolved.tree.rootId),
        controller: this.controller, targetMatches: false, writeReady: false, localOperator: activeSigner ?? null, operatorGasWei: activeGas,
        next: 'This is only a read. Call selectCapitalRoot explicitly before any action on this root.' } };
  }
  async prepare({ budgetRaw = '100000', openBrowser = true, expectedBoundOperator, recovery = false }) {
    await this.initialize();
    const tree = await this.client.getTree(BigInt(this.rootId));
    if (tree.nodes.find(node => String(node.id) === this.rootId)?.revoked) {
      throw new SetupError('ROOT_REVOKED', 'This root is permanently revoked. Operator replacement cannot reactivate it. No key, funding request or wallet handoff was created. Select an active root or explicitly create a new one.');
    }
    let operator = await this.localOperator();
    const mismatched = tree.operator.toLowerCase() !== operator?.toLowerCase() && tree.operator !== ZERO;
    if (mismatched && !recovery) throw new SetupError('OPERATOR_RECOVERY_REQUIRED', 'The onchain operator is not this local signer. Call prepareOperatorRecovery with the currently bound operator address. It prepares an OWNER-REVIEWED rebind only; no key import or automatic replacement.');
    if (recovery && tree.operator.toLowerCase() !== expectedBoundOperator?.toLowerCase()) throw new SetupError('BINDING_CHANGED', 'The bound operator changed since review. Read getCapitalSetup again. No key or transaction was created.');
    operator ??= await prepareRootOperator(this.runtimeRoot, this.rootId, this.controller);
    const setup = await this.inspect(budgetRaw, tree);
    const actions = [];
    const link = action => {
      const url = new URL('/setup', this.walletOrigin);
      for (const [key, value] of Object.entries({ vault: setup.ensName, action, operator, budget: budgetRaw })) url.searchParams.set(key, value);
      return url.href;
    };
    if (!setup.checks.operatorBound) actions.push({ action: 'authorize-agent', url: link('set-root-operator'),
      owner: tree.owner, previousOperator: tree.operator, newOperator: operator,
      maxTestUsdcPerActionRaw: budgetRaw, rights: ['delegate', 'restrict', 'reclaim'],
      effect: `Owner-signed operator change increments authority generation and invalidates existing mandates (${tree.nodes.length - 1} existing children). Owner and vault funds are unchanged.` });
    if (setup.fundingShortfallRaw > 0n) actions.push({ action: 'fund-shortfall', url: link('fund-root'),
      asset: 'Test-USDC', amountRaw: setup.fundingShortfallRaw, vault: setup.vault });
    // A modest target reserve, not a prediction that every future transaction is affordable.
    const reserve = 10_000_000_000_000_000n;
    if ((setup.operatorGasWei ?? 0n) < reserve) actions.push({ action: 'fund-agent-gas', url: link('fund-operator-gas'),
      recipient: operator, asset: 'native Sepolia ETH', targetBalanceWei: reserve,
      amountWei: reserve - (setup.operatorGasWei ?? 0n), note: 'Top up to 0.01 Sepolia ETH; wallet rechecks the balance before signing. Reserve, not a fee guarantee. Not USDC, not an approval. Unused ETH stays with this local signer.' });
    const url = actions[0]?.url ?? link('');
    const browser = openBrowser && actions.length ? await openWalletBrowser(url) : { opened: false, method: 'not-requested', walletDetected: false };
    return { ...setup, url, browser, walletActions: actions, transactionSubmitted: false,
      next: 'Owner reviews the listed wallet actions. Existing funding is counted across the tree; do not deposit again. Then call getCapitalSetup in this SAME MCP session; no root-switch restart is needed.' };
  }
  assertTarget(expectedRootId) {
    if (String(expectedRootId) !== this.rootId) throw new SetupError('WRONG_TARGET_ROOT', `Active MCP root is #${this.rootId}; no action was forwarded. Select the intended root explicitly, then use its expectedRootId.`);
  }
  async preflight(expectedRootId, operationKey) {
    await this.initialize(); this.assertTarget(expectedRootId);
    const setup = await this.inspect();
    if (!this.writesEnabled) throw new SetupError('WRITES_DISABLED', 'Enable --enable-sepolia-writes explicitly. No transaction forwarded.');
    if (!setup.checks.localKey) throw new SetupError('PROFILE_MISSING', 'No local signer for this root. Prepare setup/recovery first.');
    if (!setup.checks.operatorBound) throw new SetupError('SIGNER_MISMATCH', 'Local signer does not match the bound onchain operator. Owner authorization is required.');
    const recorded = operationKey ? await this.client.controller.read.getOperation([BigInt(this.rootId),BigInt(this.rootId),setup.authorityGeneration,operationKey], {blockNumber:setup.source.blockNumber}) : null;
    if (!setup.checks.operatorHasGas) {
      // A confirmed retry requires no gas or additional capital; let the coordinator reconcile it.
      if (!recorded?.nodeId) throw new SetupError('GAS_MISSING', `Local signer ${setup.localOperator} has zero native Sepolia ETH. Fund gas, not USDC.`);
    }
    return { ...setup, operationAlreadyRecorded: Boolean(recorded?.nodeId) };
  }
}
