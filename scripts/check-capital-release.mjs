#!/usr/bin/env node
// Read-only deployment and worker prerequisites. This is not an end-to-end acceptance test.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Contract, isAddress, JsonRpcProvider } from 'ethers';
import { checkWorkerHost, loadWorkerHost } from '../packages/runtime/worker-host.mjs';

const args = process.argv.slice(2);
const capitalOnly = args.length === 1 && args[0] === '--capital-only';
const report = { kind: 'capital_release_prerequisites', scope: capitalOnly ? 'capital_only' : 'capital_and_worker',
  status: 'blocked', checkedAt: new Date().toISOString(), checks: {} };
const check = async (name, code, action) => {
  try { report.checks[name] = { status: 'passed', ...await action() }; }
  catch { report.checks[name] = { status: 'blocked', reason: code }; }
};

if (args.length && !capitalOnly) {
  report.checks.arguments = { status: 'blocked', reason: 'USE_CAPITAL_ONLY_OR_NO_FLAG' };
} else {
  let manifest;
  await check('manifest', 'INVALID_MANIFEST', async () => {
    manifest = JSON.parse(await readFile(process.env.ACT_DEPLOYMENT_MANIFEST ?? new URL('../deployments/usdc-sepolia.json', import.meta.url), 'utf8'));
    if (manifest.chainId !== 11155111 || !isAddress(manifest.contracts?.CapitalController?.address) ||
        !isAddress(manifest.contracts?.ProjectRegistry?.address) || !isAddress(manifest.ensNamespace?.registry) ||
        !/^([a-z0-9-]+)\.eth$/.test(manifest.ensNamespace?.name ?? '')) throw new Error('invalid manifest');
    return { source: process.env.ACT_DEPLOYMENT_MANIFEST ? 'staged' : 'default' };
  });

  if (manifest && report.checks.manifest.status === 'passed') {
    let rpc;
    try {
      rpc = new JsonRpcProvider(process.env.ACT_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia.publicnode.com');
      await check('chain', 'SEPOLIA_UNAVAILABLE_OR_WRONG_CHAIN', async () => {
        if ((await rpc.getNetwork()).chainId !== 11155111n) throw new Error('wrong chain');
        return { chainId: 11155111 };
      });
      if (report.checks.chain.status === 'passed') {
        const controllerAddress = manifest.contracts.CapitalController.address;
        const controller = new Contract(controllerAddress, [
          'function rootCapitalLimit(uint256) view returns (uint256)',
          'function PROJECT_REGISTRY() view returns (address)'
        ], rpc);
        await check('controllerCode', 'CONTROLLER_CODE_MISSING_OR_RPC_UNAVAILABLE', async () => {
          if ((await rpc.getCode(controllerAddress)) === '0x') throw new Error('missing code');
          return { controller: controllerAddress };
        });
        if (report.checks.controllerCode.status === 'passed') {
          await check('sharedLimit', 'ROOT_CAPITAL_LIMIT_UNSUPPORTED_OR_UNAVAILABLE', async () => {
            await controller.rootCapitalLimit(0n);
            return {};
          });
          await check('namespace', 'NAMESPACE_REGISTRY_MISMATCH_OR_UNAVAILABLE', async () => {
            const projectRegistry = await controller.PROJECT_REGISTRY();
            const registry = new Contract(manifest.ensNamespace.registry,
              ['function getSubregistry(string) view returns (address)'], rpc);
            const label = manifest.ensNamespace.name.slice(0, -4);
            const attached = await registry.getSubregistry(label);
            if (projectRegistry.toLowerCase() !== manifest.contracts.ProjectRegistry.address.toLowerCase() ||
                attached.toLowerCase() !== projectRegistry.toLowerCase()) throw new Error('registry mismatch');
            return { projectRegistry };
          });
        }
      }
    } catch { report.checks.chain ??= { status: 'blocked', reason: 'SEPOLIA_UNAVAILABLE_OR_WRONG_CHAIN' }; }
    finally { rpc?.destroy(); }
  }

  if (capitalOnly) report.checks.workerHost = { status: 'skipped', reason: 'CAPITAL_ONLY' };
  else {
    await check('workerHost', 'WORKER_HOST_INVALID_OR_UNAVAILABLE', async () => {
      const config = await loadWorkerHost(join(homedir(), '.agent-capital-tree'));
      const preflight = await checkWorkerHost(config);
      if (!preflight.workerReady) throw new Error('worker unavailable');
      return { inference: config.inference, model: preflight.model, workerStarted: false };
    });
  }
}

const required = ['manifest', 'chain', 'controllerCode', 'sharedLimit', 'namespace', ...(capitalOnly ? [] : ['workerHost'])];
if (required.every(name => report.checks[name]?.status === 'passed')) report.status = 'prerequisites_met';
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== 'prerequisites_met') process.exitCode = 1;
