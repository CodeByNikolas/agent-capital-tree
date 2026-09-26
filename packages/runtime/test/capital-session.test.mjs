import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpath, mkdtemp, rm, readdir, readFile, mkdir, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapitalSession, safeCapitalError } from '../capital-session.mjs';
import { demoBudgetSchema, DEMO_BUDGET_MESSAGE } from '../../plugin/demo-budget.mjs';

const controller = `0x${'1'.repeat(40)}`, owner = `0x${'2'.repeat(40)}`;
const usdc = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
test('unbound capital session keeps public reads but blocks implicit setup and writes', async () => {
  const session = new CapitalSession({ controller, base: '/unused', repo: '/repo', writesEnabled: true,
    client: { resolveTree: async () => ({tree:tree('4'),selectedNodeId:4n}) } });
  assert.equal((await session.inspect()).activeMcpRootId, null);
  assert.equal((await session.inspect()).writesEnabled, true);
  assert.equal((await session.tree('4')).mcp.activeMcpRootId, null);
  await assert.rejects(session.prepare({openBrowser:false}), /ROOT_NOT_SELECTED/);
  await assert.rejects(session.preflight('4'), /ROOT_NOT_SELECTED/);
  assert.equal(session.runtimeRoot, undefined);
});
function tree(id) { return { rootId: BigInt(id), generation: 1n, tokens: [usdc, controller], owner, operator: owner,
  nodes: [{ id: BigInt(id), parentId: 0n, ensName: `root-${id}.agentcapitalusdc.eth`, vault: controller,
    balances: [100000n, 0n], authorizedActions: ['delegate','restrict','reclaim'], effectivePolicy: {maxAmounts:[100000n,0n],tokenMask:1} }],
  totalBalances:[100000n,0n],source:{chainId:11155111,blockNumber:42n} }; }

test('budget errors explain units, shared scope and demo-only cap', () => {
  for (const value of ['5000000','500000','0','-1','1.2','NaN','9'.repeat(1000)]) {
    const result = demoBudgetSchema.safeParse(value);
    assert.equal(result.success, false); assert.equal(result.error.issues[0].message, DEMO_BUDGET_MESSAGE);
  }
  assert.equal(demoBudgetSchema.parse('100000'), '100000');
  assert.match(safeCapitalError(new Error('No vault in this Sepolia deployment matches')), /ROOT_NOT_FOUND/);
  assert.match(safeCapitalError(new Error('https://provider/SECRET')), /RPC_OR_RUNTIME_UNAVAILABLE/);
  assert.doesNotMatch(safeCapitalError(new Error('https://provider/SECRET')), /SECRET/);
});

test('one-time setup preserves its signer and restores the authorized root after restart', { skip: !['linux', 'darwin'].includes(process.platform) }, async () => {
  const base = await mkdtemp(join(await realpath(tmpdir()), 'kanoki-onboarding-'));
  let chainTree;
  const client = { resolveTree: async () => {
    if (!chainTree) throw new Error('No vault in this Sepolia deployment matches that name or address');
    return { tree: chainTree, selectedNodeId: 4n };
  }, getTree: async () => chainTree, rpc: { getBalance: async () => 10000000000000000n } };
  const fresh = () => new CapitalSession({ client, controller, base, repo: '/not-private', writesEnabled: true });
  try {
    const session = fresh();
    const first = await session.onboarding.prepare({budgetRaw:'100000',openBrowser:false});
    assert.match(first.ensName, /^kanoki-[0-9a-f]{16}\./);
    assert.equal(new URL(first.url).searchParams.get('operator'),first.localOperator);
    const repeated = await fresh().onboarding.prepare({budgetRaw:'100000',openBrowser:false});
    assert.equal(repeated.localOperator,first.localOperator);
    assert.equal(repeated.ensName,first.ensName);
    assert.equal((await session.inspect()).activeMcpRootId,null);
    chainTree = tree('4');
    assert.equal((await session.inspect()).activeMcpRootId,null,'A different bound signer is never adopted');
    chainTree.operator = first.localOperator;
    const ready = await session.inspect();
    assert.equal(ready.activeMcpRootId,'4');
    assert.equal(ready.writeReady,true);
    const restarted = await fresh().inspect();
    assert.equal(restarted.localOperator,first.localOperator);
    assert.equal(restarted.activeMcpRootId,'4');
    assert.equal(restarted.writeReady,true);
    chainTree.nodes[0].revoked = true;
    await assert.rejects(fresh().inspect(), /ROOT_REVOKED/);
  } finally { await rm(base,{recursive:true,force:true}); }
});

test('explicit root selection, owner-bound recovery, no refund, snapshot and signer/gas guards', { skip: !['linux', 'darwin'].includes(process.platform) }, async () => {
  const base = await mkdtemp(join(await realpath(tmpdir()), 'act-onboarding-'));
  const roots = new Map([['3',tree(3)],['4',tree(4)],['5',tree(5)]]);
  let gas = 0n, gasCalls = 0, closed = 0;
  const client = { resolveTree: async query => {
    if (!roots.has(query)) throw new Error('No vault in this Sepolia deployment matches');
    return { tree: structuredClone(roots.get(query)), selectedNodeId: BigInt(query) };
  }, getTree: async id => structuredClone(roots.get(String(id))), rpc: {getBalance: async ({address,blockNumber}) => {
    assert.notEqual(address, owner); assert.equal(blockNumber,42n); gasCalls++; return gas;
  }}, controller:{read:{getOperation:async()=>({nodeId:9n})}} };
  const session = new CapitalSession({ client, controller, base, repo: '/not-the-private-store', query:'3', writesEnabled:true,
    closeRuntime: async () => { closed++; } });
  try {
    const absent = await session.inspect();
    const policy = await session.policy('3');
    assert.deepEqual(policy.maxAmounts, [100000n, 0n]);
    assert.equal(policy.source.blockNumber, 42n);
    await assert.rejects(session.policy('4'), /NODE_NOT_IN_ACTIVE_ROOT/);
    await assert.rejects(session.policy('bad-id'), /INVALID_NODE/);
    roots.get('3').nodes[0].revoked = true;
    assert.equal((await session.policy('3')).revoked, true, 'Revoked policy is public and needs no signer');
    assert.equal((await session.inspect()).writeReady, false);
    await assert.rejects(session.prepare({openBrowser:false}), /ROOT_REVOKED/);
    await assert.rejects(session.prepare({recovery:true,expectedBoundOperator:owner,openBrowser:false}), /ROOT_REVOKED/);
    assert.deepEqual(await readdir(base), [], 'Revoked preparation creates no private key');
    roots.get('3').nodes[0].revoked = false;
    assert.equal(absent.operatorGasWei, null); assert.equal(gasCalls,0); assert.equal(absent.writeReady,false);
    const viewed = await session.tree('4');
    assert.equal(viewed.mcp.activeMcpRootId,'3'); assert.equal(viewed.mcp.writeReady,false);
    await assert.rejects(session.preflight('4'), /WRONG_TARGET_ROOT/);
    await session.select('4');
    await assert.rejects(session.prepare({openBrowser:false}), /OPERATOR_RECOVERY_REQUIRED/);
    assert.deepEqual(await readdir(base), []); // Original protection is retained, not bypassed.
    await assert.rejects(session.prepare({recovery:true,expectedBoundOperator:controller}), /BINDING_CHANGED/);
    const recovery = await session.prepare({recovery:true,expectedBoundOperator:owner,openBrowser:false});
    assert.notEqual(recovery.localOperator, owner);
    assert.equal(recovery.walletActions.some(a=>a.action==='fund-shortfall'),false);
    assert.equal(recovery.transactionSubmitted,false);
    const keyPath = join(session.runtimeRoot,'keys','root-4.keystore.json');
    const originalKeyFile = await readFile(keyPath);
    const again = await session.prepare({recovery:true,expectedBoundOperator:owner,openBrowser:false});
    assert.equal(again.localOperator,recovery.localOperator);
    assert.deepEqual(await readFile(keyPath),originalKeyFile);
    await assert.rejects(session.preflight('4'), /SIGNER_MISMATCH/);
    roots.get('4').operator = recovery.localOperator; // Simulates OWNER's wallet confirmation, no public write.
    await assert.rejects(session.preflight('4'), /GAS_MISSING/);
    assert.equal((await session.preflight('4',`0x${'a'.repeat(64)}`)).operationAlreadyRecorded,true,'Confirmed retry needs no new gas');
    gas = 10000000000000000n;
    assert.equal((await session.preflight('4')).writeReady,true);
    const graphic = await session.tree('4');
    assert.equal(graphic.mcp.source.blockNumber,graphic.source.blockNumber);
    assert.deepEqual(graphic.mcp.source,graphic.source);
    // Two allocated children do not create a funding request for the root's now-smaller free balance.
    roots.get('4').nodes[0].balances[0] = 60000n;
    assert.equal((await session.inspect()).fundingShortfallRaw,0n);
    await session.select('3'); await session.select('4');
    assert.equal(await session.localOperator(),recovery.localOperator);
    assert.deepEqual(await readFile(keyPath),originalKeyFile); assert.ok(closed>=4);
    roots.get('5').operator='0x0000000000000000000000000000000000000000';
    await session.select('5');
    roots.get('5').nodes[0].revoked = true;
    const revoked = await session.inspect();
    assert.equal(revoked.rootRevoked, true);
    assert.equal(revoked.writeReady, false);
    assert.match(revoked.setupBlockedReason, /ROOT_REVOKED/);
    await assert.rejects(session.prepare({openBrowser:false}), /ROOT_REVOKED/);
    await assert.rejects(session.prepare({recovery:true,expectedBoundOperator:roots.get('5').operator,openBrowser:false}), /ROOT_REVOKED/);
    assert.equal(await session.localOperator(), undefined, 'Revoked setup must not create a key');
    roots.get('5').nodes[0].revoked = false;
    const fresh = await session.prepare({openBrowser:false});
    assert.ok(fresh.localOperator); assert.equal(fresh.transactionSubmitted,false);
    assert.notEqual(fresh.localOperator,recovery.localOperator);
  } finally { await rm(base,{recursive:true,force:true}); }
});


test('profile discovery ignores unrelated directories but rejects an unsafe signing profile', async () => {
  const base = await mkdtemp(join(await realpath(tmpdir()), 'kanoki-profile-discovery-'));
  const unrelated = join(base, 'tools');
  try {
    await mkdir(unrelated);
    await chmod(unrelated, 0o755);
    const session = new CapitalSession({ base, controller, repo: '/not-this-directory' });
    assert.equal(await session.profile('1'), join(base, `capital-${controller}-1`));
    await writeFile(join(unrelated, 'domain.json'), JSON.stringify({chainId:11155111,rootId:'1',controller}), {mode:0o600});
    await assert.rejects(session.profile('1'), /UNSAFE_PROFILE/);
  } finally { await rm(base, {recursive:true,force:true}); }
});
