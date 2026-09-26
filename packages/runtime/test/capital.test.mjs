import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeCompanion, SpawnCoordinator, FileSpawnJournal, capitalReadiness, TEST_USDC, prepareRootOperator, NativeCodexLauncher, DockerWorkerLauncher } from '../dist/index.js';

const parent = { workerId: 'root', rootId: '3', nodeId: '3', authorityGeneration: '1' };
const controller = `0x${'1'.repeat(40)}`;
const request = { operationKey: `0x${'a'.repeat(64)}`, name: 'hello-son', token: TEST_USDC,
  amount: '50000', restrictions: {}, task: '', model: '', execution: 'vault-only' };

test('capital allocation is durable and never dispatches or funds a model worker', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'act-capital-test-'));
  let receipt, sends = 0;
  const chain = { reconcile: async () => receipt, submit: async () => { sends++; receipt = { childId: '4', blockHash: 'block' }; }, confirmed: async () => true };
  const forbidden = async () => { assert.fail('No Docker, provider grant or child gas'); };
  try {
    const journal = new FileSpawnJournal(directory);
    const run = () => new SpawnCoordinator(chain, journal, forbidden, forbidden);
    assert.equal((await run().spawn(parent, request)).dispatchStatus, 'not_requested');
    assert.equal((await run().spawn(parent, request)).dispatchStatus, 'not_requested');
    assert.equal(sends, 1);
    await assert.rejects(run().spawn(parent, { ...request, execution: undefined }), /different parameters/);
    await assert.rejects(run().spawn(parent, { ...request, amount: '100000' }), /different parameters/);
    const emptyJournal = { get: async () => undefined, put: async () => {} };
    assert.equal((await new SpawnCoordinator(chain, emptyJournal, forbidden).spawn(parent, request)).dispatchStatus, 'not_requested');
    assert.equal(sends, 1);
    await assert.rejects(new SpawnCoordinator({ ...chain, confirmed: async () => false }, journal, forbidden).spawn(parent, request), /not confirmed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('capital companion has no Docker launcher, broker or provider configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'act-capital-config-'));
  const companion = new RuntimeCompanion({ mode: 'capital', runtimeRoot: directory, rootId: '3', controller,
    rpcUrl: 'http://127.0.0.1:1', writesEnabled: true });
  assert.equal(companion.launcher, undefined);
  assert.equal(companion.broker, undefined);
  assert.equal(companion.brokerServer, undefined);
  await new Promise(resolve => companion.tools.listen(0, '127.0.0.1', resolve));
  const token = companion.sessions.issue(parent, Date.now() + 10_000);
  const call = async (name, args) => fetch(`http://127.0.0.1:${companion.tools.address().port}/v1/tools/${name}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(args)
  });
  let calls = 0;
  companion.coordinator.spawn = async (context, input) => {
    assert.deepEqual(context, parent); assert.equal(input.execution, 'vault-only'); calls++;
    return { childId: '4', dispatchStatus: 'not_requested' };
  };
  try {
    const { token: asset, execution, task, model, ...args } = request;
    const result = await call('createChildVault', { ...args, asset });
    assert.equal(result.status, 200); assert.equal((await result.json()).dispatchStatus, 'not_requested');
    assert.equal((await call('createChildVault', { ...args, asset, agentId: 'sibling' })).status, 400);
    assert.equal((await call('spawnChild', { ...args, asset, task: 'work', model: 'model' })).status, 409);
    assert.equal(calls, 1);
    await companion.stopOrphans(); // Does not need Docker for a new profile.
    const { createHash } = await import('node:crypto');
    const domain = createHash('sha256').update(controller).digest('hex').slice(0, 12);
    await mkdir(join(directory, 'workers', `node-${domain}-3-4-g1`));
    await assert.rejects(companion.stopOrphans(), /Previous worker state/);
  } finally { await companion.close(); await rm(directory, { recursive: true, force: true }); }
});

test('one snapshot checklist lists ALL blockers and distinguishes ETH gas from USDC', () => {
  const tree = { rootId: 3n, totalBalances: [100000n, 0n], tokens: [TEST_USDC, controller], owner: controller, operator: controller,
    nodes: [{ id: 3n, ensName: 'hello.agentcapitalusdc.eth', vault: controller, balances: [100000n, 0n],
      authorizedActions: [], effectivePolicy: { maxAmounts: [0n, 0n], tokenMask: 0 } }],
    source: { chainId: 11155111, blockNumber: 42n } };
  const status = capitalReadiness(tree, undefined, 0n);
  assert.equal(status.checks.vaultFunded, true);
  assert.equal(status.prerequisitesMet, false);
  assert.deepEqual(status.missing, ['localKey', 'operatorBound', 'delegation', 'restriction', 'recovery', 'usdcAllowed', 'usdcLimit', 'operatorHasGas']);
  assert.equal(status.source, tree.source);
  tree.nodes[0].authorizedActions = ['delegate', 'restrict', 'reclaim'];
  tree.nodes[0].effectivePolicy = { maxAmounts: [100000n, 0n], tokenMask: 1 };
  assert.equal(capitalReadiness(tree, controller, 1n).prerequisitesMet, true);
  assert.throws(() => capitalReadiness({ ...tree, source: { chainId: 1 } }, controller, 1n), /Sepolia/);
  assert.throws(() => capitalReadiness(tree, controller, 1n, 100001n), /budget/);
});

test('Linux capital lifecycle opens only the scoped tool server, without Docker or inference', { skip: process.platform !== 'linux', timeout: 60_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'act-capital-lifecycle-'));
  let companion;
  try {
    const operator = await prepareRootOperator(directory, '3', controller);
    companion = new RuntimeCompanion({ mode: 'capital', runtimeRoot: directory, rootId: '3', controller,
      rpcUrl: 'http://127.0.0.1:1', writesEnabled: false });
    companion.chain.client = { verifyDeployment: async () => {}, controller: { read: {
      getNode: async () => ({ id: 3n, rootId: 3n, generation: 1n, revoked: false, agent: operator }),
      rootGeneration: async () => 1n, rootOperator: async () => operator,
      getOperation: async () => ({ nodeId: 0n })
    } } };
    companion.currentAuthority = async () => true; // Chain authorization mocked; real Unix storage/listeners exercised.
    const ready = await companion.start();
    assert.equal(ready.brokerOrigin, undefined);
    assert.match(ready.toolsOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const { readFile, stat } = await import('node:fs/promises');
    const token = await readFile(ready.rootTokenFile, 'utf8');
    assert.equal((await stat(ready.rootTokenFile)).mode & 0o777, 0o600);
    const response = await fetch(`${ready.toolsOrigin}/v1/tools/getOperationStatus`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ operationKey: request.operationKey })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).recordedOnchain, false);
    await companion.close(); companion = undefined;
    await assert.rejects(stat(ready.rootTokenFile), { code: 'ENOENT' });
  } finally { await companion?.close(); await rm(directory, { recursive: true, force: true }); }
});


test('merged companion keeps native workers as default and proxy inference explicit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'act-worker-modes-'));
  const common = { runtimeRoot: directory, rootId: '3', controller, rpcUrl: 'http://127.0.0.1:1',
    writesEnabled: true, imageId: `sha256:${'a'.repeat(64)}`, models: ['gpt-6-luna'],
    workerUid: 1000, workerGid: 1000, childGasWei: 0n };
  try {
    const native = new RuntimeCompanion({ ...common, codexBinary: '/unused/codex',
      codexHome: join(directory, 'codex'), reasoningEffort: 'high' });
    assert.ok(native.launcher instanceof NativeCodexLauncher);
    assert.equal(native.broker, undefined);
    await new Promise(resolve => native.tools.listen(0, '127.0.0.1', resolve));
    const token = native.sessions.issue(parent, Date.now() + 10_000);
    let allocations = 0;
    native.coordinator.spawn = async () => { allocations++; };
    native.launcher.ensureAvailable = async model => {
      assert.equal(model, 'gpt-6-luna');
      throw new Error('model unavailable');
    };
    try {
      const response = await fetch(`http://127.0.0.1:${native.tools.address().port}/v1/tools/spawnChild`, {
        method: 'POST', headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ operationKey: request.operationKey, name: 'worker', task: 'Read balances',
          model: 'gpt-6-luna', asset: TEST_USDC, amount: '10000000', restrictions: {} })
      });
      assert.equal(response.status, 409);
      assert.equal(allocations, 0, 'preflight failure must prevent allocation');
    } finally { await native.close(); }
    const proxy = new RuntimeCompanion({ ...common, inference: 'cliproxyapi',
      upstream: 'http://127.0.0.1:1/v1', upstreamKey: 'synthetic-test-key' });
    assert.ok(proxy.launcher instanceof DockerWorkerLauncher);
    assert.ok(proxy.broker);
    await proxy.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
