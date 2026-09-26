#!/usr/bin/env node
// Config-free capital demo. Windows delegates to Linux; private keys never cross WSL.
import { spawn, execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import currentManifest from '../../deployments/usdc-sepolia.json' with { type: 'json' };
import recoveryManifest from '../../deployments/history/usdc-full-vaults-sepolia.json' with { type: 'json' };

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
  const manifest = recoveryDeployment ? recoveryManifest : currentManifest;
  if (manifest.chainId !== 11155111) throw new Error('Expected Ethereum Sepolia manifest');
  const controller = manifest.contracts.CapitalController.address;
  const rpcUrl = process.env.ACT_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia.publicnode.com';
  const client = capitalClient(rpcUrl, controller);
  let companion, bridge;
  const session = new CapitalSession({ client, controller, base: join(homedir(), '.agent-capital-tree'),
    namespace: manifest.ensNamespace.name, walletOrigin: recoveryDeployment ? 'https://agent-capital-tree-silk.vercel.app' : 'https://kanoki-app.vercel.app',
    repo, query, explicitRoot, writesEnabled, closeRuntime: async () => { await companion?.close(); companion = undefined; bridge = undefined; } });
  const {loadWorkerHost,checkWorkerHost} = await import('./worker-host.mjs');
  let workerHost,workerHostInvalid=false;
  try {workerHost=await loadWorkerHost(session.base);}catch{workerHostInvalid=true;}
  const serialize = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
  if (command === 'check') console.log(serialize(await session.inspect()));
  else if (command === 'prepare') console.log(serialize(await session.prepare({ openBrowser: false })));
  else {
    const { visualServer } = await import('../plugin/visual-server.mjs');
    const { toolSpecs } = await import('../plugin/dist/tools.js');
    const { RuntimeClient } = await import('../plugin/dist/runtime-client.js');
    const { StdioServerTransport } = await import('../plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js');
    const { z } = await import('../plugin/node_modules/zod/index.js');
    const { continueCapitalSetup } = await import('./capital-continue.mjs');
    const { rootSetupSpec } = await import('../../scripts/root-wallet-setup.mjs');
    const { demoBudgetSchema } = await import('../plugin/demo-budget.mjs');
    const budgetRaw = demoBudgetSchema;
    const expectedRootId = z.string().regex(/^[1-9]\d*$/).describe('Required write-target confirmation. Must equal the active MCP root reported by getCapitalSetup. Reading a tree does NOT change it.');
    const scoped = Object.fromEntries(Object.entries(toolSpecs).map(([name, spec]) => [name,
      !spec.readOnly || name === 'getOperationStatus' ? { ...spec, schema: spec.schema.extend({ expectedRootId }),
        description: `${spec.description} Explicit expectedRootId must match the selected MCP root. ${name === 'spawnChild' ? 'Real AI worker: project worker-host prerequisites must pass before allocation. No owner signature per child after setup.' : ''}` } : spec]));
    const specs = { ...scoped,
      getEffectivePolicy: { ...scoped.getEffectivePolicy, description: 'Read inherited policy and actual onchain rights for a node in the selected root. No local signer, gas, authorization or running companion is required; revoked roots remain readable.' },
      getCapitalActivity: { ...scoped.getCapitalActivity, description: 'UNAVAILABLE in capital demo mode: indexed activity history is not configured. Use getTree and getEffectivePolicy for current chain state. Worker mode can configure MultiBaas history separately.' },
      purchaseService: { ...scoped.purchaseService, description: 'UNAVAILABLE in capital demo mode: no paid services are configured. Requires separate worker-mode service configuration.' },
      visualizeTree: { ...toolSpecs.getTree, description: 'Alias of getTree. Return data and dashboard images from the same Sepolia snapshot.' },
      prepareRootSetup: { ...rootSetupSpec, schema: rootSetupSpec.schema.extend({ label: rootSetupSpec.schema.shape.label.optional(), budgetRaw:budgetRaw.optional(), fundingRaw:z.string().regex(/^(0|[1-9]\d{0,77})$/).optional().describe('User-authorized funding target, raw USDC; separate from capital limit. Required on first setup.'),userConfirmedLimit:z.boolean().optional().describe('True only after the user explicitly supplied or confirmed the shared capital limit and funding. Never infer consent.'),test:z.union([toolSpecs.createChildVault.schema,toolSpecs.spawnChild.schema]).optional().describe('Persist the explicitly requested child test with its stable operationKey and narrowed mandate. Include task and model for a real autonomous worker; omit both for vault-only. Reused on restart.') }),
        description: 'Start or resume the ONE-TIME Kanoki wallet setup. Automatically prepares and preserves the local signer and a unique name; no ENS choice or manual configuration needed. The user confirms creation, authorization, funding and gas in one guided page. Subsequent getCapitalSetup automatically discovers and restores this vault across chat restarts. Sends no transaction itself.' },
      selectCapitalRoot: { readOnly: false, schema: z.object({ query: z.string().min(1).max(253) }).strict(), description: 'Explicitly switch THIS MCP session to a confirmed root ENS/vault/ID. Closes the old companion safely, preserves all profiles, sends no transaction. No restart/config edit needed. New sessions start at the configured root; call this tool again if needed.' },
      getCapitalSetup: { readOnly: true, schema: z.object({ budgetRaw:budgetRaw.optional() }).strict(), description: 'Inspect saved setup, including prepared signer and gas before root creation. No default funding and no demo maximum. Ask for the shared capital limit and token before preparing a new setup. Continue polling while the user signs; resume the authorized test automatically when writeReady, without done, hashes or root selection.' },
      getWorkerSetup:{readOnly:true,schema:z.object({model:z.string().optional()}).strict(),description:'Check project-provisioned Docker image and native Codex authentication/model access before any autonomous child allocation. Never reports a worker started; end users do not configure credentials per vault.'},
      continueCapitalSetup: {readOnly:false,schema:z.object({waitSeconds:z.number().int().min(0).max(20).default(20)}).strict(),description:'Continue the saved, explicitly authorized setup/test. Wait up to 20 seconds for wallet prerequisites, then run the saved child operation with its original key and verify the resulting tree. Keep invoking while awaiting_wallet without asking for done or hashes. No wallet signature or funding is performed by this tool.'},
      prepareCapitalSetup: { readOnly: false, schema: z.object({ budgetRaw, expectedRootId, openBrowser: z.boolean().default(true) }).strict(), description: 'Prepare an unbound root’s local key and a grouped normal-browser wallet handoff. Never replace a bound operator. Reuse existing funding/profile. No autonomous worker. If OPERATOR_RECOVERY_REQUIRED, use prepareOperatorRecovery.' },
      prepareOperatorRecovery: { readOnly: false, schema: z.object({ expectedRootId, expectedBoundOperator: z.string().regex(/^0x[a-fA-F0-9]{40}$/), budgetRaw, openBrowser: z.boolean().default(true) }).strict(), description: 'Explicit recovery for a root bound to a wallet/unavailable signer. Preserve existing keys; prepare/reuse a LOCAL signer and OWNER-REVIEWED operator-change link. Requires current bound address to prevent stale changes. Does NOT replace the operator onchain, import an owner key, fund anything or launch a worker. Shows affected children, exact remaining funding and native gas separately.' }
    };
    // Do not advertise features that this installation cannot execute.
    for (const unavailable of ['getCapitalActivity', 'getPaymentServices', 'purchaseService']) delete specs[unavailable];
    let starting, bridgeGeneration;
    async function runtime() {
      const setup = await session.inspect();
      if (bridge && bridgeGeneration === String(setup.authorityGeneration)) return bridge;
      if (bridge) await session.closeRuntime();
      starting ??= (async () => {
        if (!setup.checks.localKey || !setup.checks.operatorBound) throw new Error('SETUP_REQUIRED');
        companion = new RuntimeCompanion({ ...(workerHost ?? {mode:'capital'}), runtimeRoot: session.runtimeRoot, rootId: session.rootId, controller, rpcUrl, writesEnabled });
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
        if (name === 'continueCapitalSetup') return continueCapitalSetup(session, execute, input.waitSeconds);
        if (name === 'getCapitalSetup') return {...await session.inspect(input.budgetRaw),workers:{configured:Boolean(workerHost),status:workerHostInvalid?'invalid':workerHost?'preflight_required':'not_configured',workerStartRequested:false,next:'Call getWorkerSetup before requesting a real AI child; setup readiness alone is not worker readiness.'}};
        if (name === 'getWorkerSetup') return checkWorkerHost(workerHost,input.model);
        if (name === 'getEffectivePolicy') return session.policy(input.nodeId);
        if (name === 'selectCapitalRoot') return session.select(input.query);
        if (name === 'prepareRootSetup') {
          if (recoveryDeployment) return { status: 'unavailable', transactionSubmitted: false, next: 'This connection explicitly targets the historical USDC controller for existing-vault recovery. Create new roots with the normal current-deployment capital MCP; never confuse equally numbered roots across controllers.' };
          const previous = await session.onboarding.read();
          const test = input.test ?? previous?.test;
          if (test?.model) {
            const worker = await checkWorkerHost(workerHost,test.model);
            if (!worker.workerReady) {
              const saved = await session.onboarding.prepare({...input,openBrowser:false});
              return {...saved,status:'blocked',workers:worker,transactionSubmitted:false,next:worker.next};
            }
          }
          return session.onboarding.prepare(input);
        }
        if (name === 'prepareCapitalSetup' || name === 'prepareOperatorRecovery') {
          await session.initialize(); session.assertTarget(input.expectedRootId);
          return session.prepare({ ...input, recovery: name === 'prepareOperatorRecovery' });
        }
        if (name === 'getTree' || name === 'visualizeTree') {
          return session.tree(input.query ?? input.rootId);
        }
        if (name === 'spawnChild') {
          const worker=await checkWorkerHost(workerHost,input.model);
          if (!worker.workerReady) return {...worker,transactionSubmitted:false};
        }
        if (name === 'getPaymentServices') return { network: 'eip155:11155111', asset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, services: [] };
        if (name === 'getCapitalActivity' || name === 'purchaseService') return { status: 'unavailable', transactionSubmitted: false,
          next: 'This config-free demo does not configure indexed history or paid services. Use getTree for current chain state; these integrations are optional worker-mode configuration.' };
        if (!specs[name].readOnly && !writesEnabled) return { status: 'blocked', transactionSubmitted: false, next: 'Writes disabled. Enable --enable-sepolia-writes explicitly in this local MCP command.' };
        const { expectedRootId: target, ...args } = input;
        const isChild = name === 'createChildVault' || name === 'spawnChild';
        const checked = !specs[name].readOnly ? await session.preflight(target, isChild ? args.operationKey : undefined) : null;
        if (name === 'getOperationStatus') { await session.initialize(); session.assertTarget(target); }
        if (isChild && args.asset.toLowerCase() !== '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238') {
          throw new SetupError('UNSUPPORTED_ASSET', 'This capital setup supports the explicitly authorized Sepolia Test-USDC only.');
        }
        if (isChild && !checked.operationAlreadyRecorded) {
          if (!checked.checks.delegation || !checked.checks.usdcAllowed || BigInt(args.amount) > checked.usdcLimitRaw) throw new SetupError('MANDATE_LIMIT', 'Delegate authority, allowed Test-USDC and a sufficient per-action limit are required. No transaction forwarded.');
          if (BigInt(args.amount) > checked.usdcBalanceRaw) throw new SetupError('INSUFFICIENT_VAULT_BALANCE', 'The root lacks free Test-USDC for this allocation. Existing child balances are already delegated capital, not spendable root balance. No transaction forwarded.');
        }
        const result = await (await runtime()).call(name, args);
        return { ...result, controller, activeMcpRootId: session.rootId, targetRootId: session.rootId, backgroundWorker: result.dispatchStatus === 'started' ? 'started' : name === 'spawnChild' ? (result.dispatchStatus ?? 'not_confirmed') : 'not_requested' };
      };
    const server = await visualServer({ name: 'kanoki', specs,
      instructions: 'Show every returned graphic. First ask the user for their shared capital limit and token, unless already explicit. Never assume a default or unlimited budget. Persist the authorized child test in prepareRootSetup, then keep calling continueCapitalSetup while the owner signs; do not require done, hashes or another task prompt. Do not ask the user for an ENS name, root selection, signer preparation or configuration. The saved onboarding automatically restores the correct root after confirmation and across restarts. Use expectedRootId from getCapitalSetup for writes. Advanced selection/recovery tools are only for explicitly requested existing roots. Budget is shared across all vaults. Use spawnChild for explicitly requested real AI workers only after getWorkerSetup passes; createChildVault starts no model process. Never repeat completed funding. After actions show getTree.',
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
