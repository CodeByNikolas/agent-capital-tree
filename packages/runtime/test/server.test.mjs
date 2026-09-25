import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companionServer, WorkerSessions } from '../dist/index.js';

test('HTTP MCP transport authenticates, validates and preserves real worker context', async () => {
  const sessions = new WorkerSessions();
  const context = { workerId: 'worker', rootId: '1', nodeId: '2', authorityGeneration: '1' };
  const token = sessions.issue(context, Date.now() + 10000);
  let seen, calls = 0;
  const server = companionServer(sessions, { getTree: async (actual, args) => { seen = actual; calls++; return { amount: 10n, rootId: args.rootId }; }, revokeSubtree: async () => { throw new Error('private-provider-url'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const post = (name, args, auth = token, extra = {}) => fetch(`${endpoint}/v1/tools/${name}`, { method: 'POST', headers: { authorization: `Bearer ${auth}`, ...extra }, body: JSON.stringify(args) });
  try {
    assert.equal((await post('getTree', { rootId: '1' }, 'forged')).status, 401);
    assert.equal((await post('getTree', { rootId: '1', agentId: 'owner' })).status, 400);
    assert.equal((await post('getTree', { rootId: '1' }, token, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('spawnChild', {})).status, 501);
    assert.equal((await post('__proto__', {})).status, 404);
    const good = await post('getTree', { rootId: '1' });
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), { amount: '10', rootId: '1' });
    assert.deepEqual(seen, context);
    const error = await post('revokeSubtree', { nodeId: '3' });
    assert.equal(error.status, 409);
    assert.ok(!(await error.text()).includes('private-provider-url'));
    sessions.revoke(token);
    assert.equal((await post('getTree', { rootId: '1' })).status, 401);
    assert.equal(calls, 1);
  } finally { server.close(); }
});
