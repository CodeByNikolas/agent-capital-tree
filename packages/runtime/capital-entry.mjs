#!/usr/bin/env node
// Config-free capital demo. Windows delegates to Linux; private keys never cross WSL.
import { spawn, execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const command = args[0];
const query = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
const packageBase = new URL(import.meta.url.endsWith('/bundle/capital.mjs') ? '../' : './', import.meta.url);
const script = fileURLToPath(new URL('capital.mjs', packageBase));
const repo = fileURLToPath(new URL('../..', packageBase));
const usage = 'node packages/runtime/capital.mjs prepare|check|settings|stdio [ENS-name|vault-address|root-id] [--runtime-root /private/linux/path] [--deployment usdc-full-vaults] [--enable-sepolia-writes]';
if (!['prepare', 'check', 'settings', 'stdio'].includes(command) || (command === 'prepare' && !query)) throw new Error(usage);
let explicitRoot, writesEnabled = false, recoveryDeployment = false;
for (let i = query ? 2 : 1; i < args.length; i++) {
  if (args[i] === '--runtime-root' && args[i + 1] && !explicitRoot) explicitRoot = args[++i];
  else if (args[i] === '--enable-sepolia-writes' && !writesEnabled) writesEnabled = true;
  else if (args[i] === '--deployment' && args[i + 1] === 'usdc-full-vaults' && !recoveryDeployment) { recoveryDeployment = true; i++; }
  else throw new Error(usage);
}
const launchArgs = [script, 'stdio', ...(query ? [query] : []), ...(explicitRoot ? ['--runtime-root', explicitRoot] : []), ...(recoveryDeployment ? ['--deployment', 'usdc-full-vaults'] : []), ...(writesEnabled ? ['--enable-sepolia-writes'] : [])];
try {
if (command === 'settings') {
  console.log(JSON.stringify({ kanoki: { command: process.execPath, args: launchArgs } }, null, 2));
} else if (process.platform === 'win32') {
  const linuxScript = execFileSync('wsl.exe', ['--exec', 'wslpath', '-u', script], { encoding: 'utf8', windowsHide: true }).trim();
  // Arguments remain positional, never inserted into shell source. Login shell loads the user's Node path.
  const child = spawn('wsl.exe', ['--exec', '/bin/sh', '-lc', 'exec node "$@"', 'act-capital', linuxScript, ...args], { stdio: 'inherit', windowsHide: true });
  child.on('error', () => { process.stderr.write('WSL/Node unavailable. Install Node 22+ in your default WSL distribution. Docker is not needed.\n'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  if (process.platform !== 'linux') throw new Error('Capital signing currently requires Linux or WSL2; private Unix storage checks are not disabled.');
  const { RuntimeCompanion } = await import('./dist/index.js');
  const { CapitalSession, SetupError, privatePath, safeCapitalError } = await import('./capital-session.mjs');
  const { capitalClient } = await import('../sdk/dist/index.js');
  const manifest = JSON.parse(await readFile(new URL(recoveryDeployment ? '../../deployments/history/usdc-full-vaults-sepolia.json' : '../../deployments/usdc-sepolia.json', packageBase), 'utf8'));
  if (manifest.chainId !== 11155111) throw new Error('Expected Ethereum Sepolia manifest');
  const controller = manifest.contracts.CapitalController.address;
  const rpcUrl = process.env.ACT_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia.publicnode.com';
  const client = capitalClient(rpcUrl, controller);
  let companion, bridge;
  const session = new CapitalSession({ client, controller, base: join(homedir(), '.agent-capital-tree'),
    namespace: manifest.ensNamespace.name, walletOrigin: recoveryDeployment ? 'https://agent-capital-tree-silk.vercel.app' : 'https://agent-capital-tree.vercel.app',
    repo, query, explicitRoot, writesEnabled, closeRuntime: async () => { await companion?.close(); companion = undefined; bridge = undefined; } });
  const serialize = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
  if (command === 'check') console.log(serialize(await session.inspect()));
  else if (command === 'prepare') console.log(serialize(await session.prepare({ openBrowser: false })));
  else {
    const { visualServer } = await import('../plugin/visual-server.mjs');
    const { toolSpecs } = await import('../plugin/dist/tools.js');
    const { RuntimeClient } = await import('../plugin/dist/runtime-client.js');
    const { StdioServerTransport } = await import('../plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js');
    const { z } = await import('../plugin/node_modules/zod/index.js');
    const { rootSetupSpec, prepareRootSetup } = await import('../../scripts/root-wallet-setup.mjs');
    const { demoBudgetSchema } = await import('../plugin/demo-budget.mjs');
    const budgetRaw = demoBudgetSchema.default('100000');
    const expectedRootId = z.string().regex(/^[1-9]\d*$/).describe('Required write-target confirmation. Must equal the active MCP root reported by getCapitalSetup. Reading a tree does NOT change it.');
    const scoped = Object.fromEntries(Object.entries(toolSpecs).map(([name, spec]) => [name,
      !spec.readOnly || name === 'getOperationStatus' ? { ...spec, schema: spec.schema.extend({ expectedRootId }),
        description: `${spec.description} Explicit expectedRootId must match the selected MCP root. ${name === 'spawnChild' ? 'UNAVAILABLE in capital mode: use createChildVault; no autonomous worker is configured.' : ''}` } : spec]));
    const specs = { ...scoped,
      getEffectivePolicy: { ...scoped.getEffectivePolicy, description: 'Read inherited policy and actual onchain rights for a node in the selected root. No local signer, gas, authorization or running companion is required; revoked roots remain readable.' },
      getCapitalActivity: { ...scoped.getCapitalActivity, description: 'UNAVAILABLE in capital demo mode: indexed activity history is not configured. Use getTree and getEffectivePolicy for current chain state. Worker mode can configure MultiBaas history separately.' },
      purchaseService: { ...scoped.purchaseService, description: 'UNAVAILABLE in capital demo mode: no paid services are configured. Requires separate worker-mode service configuration.' },
      visualizeTree: { ...toolSpecs.getTree, description: 'Alias of getTree. Return data and dashboard images from the same Sepolia snapshot.' },
      prepareRootSetup: rootSetupSpec,
      selectCapitalRoot: { readOnly: false, schema: z.object({ query: z.string().min(1).max(253) }).strict(), description: 'Explicitly switch THIS MCP session to a confirmed root ENS/vault/ID. Closes the old companion safely, preserves all profiles, sends no transaction. No restart/config edit needed. New sessions start at the configured root; call this tool again if needed.' },
      getCapitalSetup: { readOnly: true, schema: z.object({ budgetRaw }).strict(), description: 'First call for the capital demo. All setup requirements from one block, active MCP root, signer match, actual rights, shared tree balance, separate LOCAL native gas. Demo budgetRaw maximum 100000 = 0.10 TOTAL Test-USDC, not per child or an onchain balance cap.' },
      prepareCapitalSetup: { readOnly: false, schema: z.object({ budgetRaw, expectedRootId, openBrowser: z.boolean().default(true) }).strict(), description: 'Prepare an unbound root’s local key and a grouped normal-browser wallet handoff. Never replace a bound operator. Reuse existing funding/profile. No autonomous worker. If OPERATOR_RECOVERY_REQUIRED, use prepareOperatorRecovery.' },
      prepareOperatorRecovery: { readOnly: false, schema: z.object({ expectedRootId, expectedBoundOperator: z.string().regex(/^0x[a-fA-F0-9]{40}$/), budgetRaw, openBrowser: z.boolean().default(true) }).strict(), description: 'Explicit recovery for a root bound to a wallet/unavailable signer. Preserve existing keys; prepare/reuse a LOCAL signer and OWNER-REVIEWED operator-change link. Requires current bound address to prevent stale changes. Does NOT replace the operator onchain, import an owner key, fund anything or launch a worker. Shows affected children, exact remaining funding and native gas separately.' }
    };
    let starting, bridgeGeneration;
    async function runtime() {
      const setup = await session.inspect();
      if (bridge && bridgeGeneration === String(setup.authorityGeneration)) return bridge;
      if (bridge) await session.closeRuntime();
      starting ??= (async () => {
        if (!setup.checks.localKey || !setup.checks.operatorBound) throw new Error('SETUP_REQUIRED');
        companion = new RuntimeCompanion({ mode: 'capital', runtimeRoot: session.runtimeRoot, rootId: session.rootId, controller, rpcUrl, writesEnabled });
        try {
          const ready = await companion.start();
          const token = (await readFile(await privatePath(ready.rootTokenFile, 0o600), 'utf8')).trim();
          bridge = new RuntimeClient(ready.toolsOrigin, token);
          bridgeGeneration = String(setup.authorityGeneration);
          return bridge;
        } catch (error) { companion = undefined; throw error; }
      })().finally(() => { starting = undefined; });
      return starting;
    }
    // Scope switches cannot interleave with in-flight actions. No unconfirmed write is retried here.
    let queue = Promise.resolve();
    const execute = async (name, input) => {
        if (name === 'getCapitalSetup') return session.inspect(input.budgetRaw);
        if (name === 'getEffectivePolicy') return session.policy(input.nodeId);
        if (name === 'selectCapitalRoot') return session.select(input.query);
        if (name === 'prepareRootSetup') {
          if (recoveryDeployment) return { status: 'unavailable', transactionSubmitted: false, next: 'This connection explicitly targets the historical USDC controller for existing-vault recovery. Create new roots with the normal current-deployment capital MCP; never confuse equally numbered roots across controllers.' };
          return prepareRootSetup(input);
        }
        if (name === 'prepareCapitalSetup' || name === 'prepareOperatorRecovery') {
          await session.initialize(); session.assertTarget(input.expectedRootId);
          return session.prepare({ ...input, recovery: name === 'prepareOperatorRecovery' });
        }
        if (name === 'getTree' || name === 'visualizeTree') {
          return session.tree(input.query ?? input.rootId);
        }
        if (name === 'spawnChild') return { status: 'unavailable', transactionSubmitted: false, next: 'Use createChildVault for chat-managed capital. Autonomous Docker workers require the separate worker configuration.' };
        if (name === 'getPaymentServices') return { network: 'eip155:11155111', asset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, services: [] };
        if (name === 'getCapitalActivity' || name === 'purchaseService') return { status: 'unavailable', transactionSubmitted: false,
          next: 'This config-free demo does not configure indexed history or paid services. Use getTree for current chain state; these integrations are optional worker-mode configuration.' };
        if (!specs[name].readOnly && !writesEnabled) return { status: 'blocked', transactionSubmitted: false, next: 'Writes disabled. Enable --enable-sepolia-writes explicitly in this local MCP command.' };
        const { expectedRootId: target, ...args } = input;
        const checked = !specs[name].readOnly ? await session.preflight(target, name === 'createChildVault' ? args.operationKey : undefined) : null;
        if (name === 'getOperationStatus') { await session.initialize(); session.assertTarget(target); }
        if (name === 'createChildVault' && (args.asset.toLowerCase() !== '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238' || BigInt(args.amount) > 100000n)) {
          throw new SetupError('DEMO_ALLOCATION_LIMIT', 'Only Test-USDC allocations up to 100000 raw (0.10) are supported by this demo. The approved budget is shared, not per child.');
        }
        if (name === 'createChildVault' && !checked.operationAlreadyRecorded) {
          if (!checked.checks.delegation || !checked.checks.usdcAllowed || BigInt(args.amount) > checked.usdcLimitRaw) throw new SetupError('MANDATE_LIMIT', 'Delegate authority, allowed Test-USDC and a sufficient per-action limit are required. No transaction forwarded.');
          if (BigInt(args.amount) > checked.usdcBalanceRaw) throw new SetupError('INSUFFICIENT_VAULT_BALANCE', 'The root lacks free Test-USDC for this allocation. Existing child balances are already delegated capital, not spendable root balance. No transaction forwarded.');
        }
        const result = await (await runtime()).call(name, args);
        return { ...result, controller, activeMcpRootId: session.rootId, targetRootId: session.rootId, backgroundWorker: 'not_requested' };
      };
    const server = await visualServer({ name: 'kanoki', specs,
      instructions: 'Show every returned graphic. Onboarding: prepareRootSetup → wallet confirms root → selectCapitalRoot(ENS) → getCapitalSetup → prepareCapitalSetup (or explicit prepareOperatorRecovery) → owner wallet authorization/funding/gas → getCapitalSetup → createChildVault with expectedRootId. Root selection persists ONLY within this session; no restart for selection. Reading another tree never changes the active root. Budget is shared across all vaults. No background worker is launched. Never repeat completed funding. After actions show getTree.',
      execute: (name, input) => { const result = queue.then(() => execute(name, input)); queue = result.catch(() => {}); return result; },
      describeError: safeCapitalError });
    let stopping = false;
    const stop = async () => {
      if (stopping) return; stopping = true;
      await starting?.catch(() => {});
      await companion?.close();
      await server.close();
    };
    process.once('SIGINT', () => { void stop(); });
    process.once('SIGTERM', () => { void stop(); });
    server.onclose = () => { void stop(); };
    await server.connect(new StdioServerTransport());
  }
}
} catch (error) {
  // RPC errors may embed provider URLs. Never print raw errors, stacks or credentials.
  const safe = ['Expected Ethereum Sepolia manifest', 'Multiple matching private profiles.', 'Use a private Linux directory',
    'Private profile domain does not match', 'Unsafe private capital profile', 'An operator is already bound', 'Capital signing currently requires'];
  process.stderr.write(`${safe.some(prefix => String(error.message).startsWith(prefix)) ? error.message : 'Capital setup unavailable. Check the root identifier, Sepolia RPC and private Linux profile. No success was confirmed.'}\n`);
  process.exitCode = 1;
}
