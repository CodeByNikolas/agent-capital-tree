import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { nonceManager, parseTransaction, toHex } from 'viem';
import { ChildGasFunding, RuntimeCompanion, childKeyId, prepareRootOperator } from '../dist/index.js';

const controllerA = `0x${'1'.repeat(40)}`;
const controllerB = `0x${'2'.repeat(40)}`;
const scope = { workerId: 'root', rootId: '1', nodeId: '1', authorityGeneration: '1' };
const operationKey = `0x${'a'.repeat(64)}`;

test('worker key IDs and root storage are bound to chain controller domain', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'act-domain-'));
  try {
    const first = await prepareRootOperator(directory, '1', controllerA);
    assert.equal(await prepareRootOperator(directory, '1', controllerA), first);
    await assert.rejects(prepareRootOperator(directory, '1', controllerB), /another controller/);
    assert.notEqual(childKeyId(scope, operationKey, controllerA), childKeyId(scope, operationKey, controllerB));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('child gas retries use one bounded signed transaction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'act-gas-'));
  const account = privateKeyToAccount(`0x${'1'.repeat(64)}`);
  const recipient = `0x${'2'.repeat(40)}`;
  const funding = new ChildGasFunding('http://127.0.0.1:1', join(directory, 'journal'));
  let sends = 0, signedHash, mined = false, chainNonce = 7;
  nonceManager.reset({ address: account.address, chainId: 11155111 });
  const parentWrite = async () => {
    const nonce = await nonceManager.consume({ address: account.address, chainId: 11155111, client: funding.rpc });
    chainNonce = nonce + 1;
    return nonce;
  };
  funding.rpc = {
    getChainId: async () => 11155111,
    estimateFeesPerGas: async () => ({ maxFeePerGas: 10_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }),
    request: async () => toHex(chainNonce),
    getTransactionReceipt: async () => mined ? { status: 'success', blockNumber: 2n } : undefined,
    sendRawTransaction: async ({ serializedTransaction }) => { sends++; signedHash = serializedTransaction; chainNonce = 9; return '0xhash'; },
    waitForTransactionReceipt: async () => { mined = true; return { status: 'success', blockNumber: 2n }; },
    getBlockNumber: async () => 3n
  };
  const key = `child-${'a'.repeat(64)}`;
  try {
    assert.equal(await parentWrite(), 7);
    const hash = await funding.fund(key, account, recipient, 1000n);
    assert.equal(parseTransaction(signedHash).nonce, 8);
    assert.equal(await funding.fund(key, account, recipient, 1000n), hash);
    assert.equal(sends, 1);
    assert.equal(await parentWrite(), 9);
    assert.ok(signedHash.startsWith('0x'));
    assert.equal((await readdir(funding.directory)).filter(name => name.endsWith('.json')).length, 1);
    await assert.rejects(funding.fund(key, account, `0x${'3'.repeat(40)}`, 1000n), /scope conflict/);
    await assert.rejects(funding.fund(`child-${'b'.repeat(64)}`, account, recipient, 200_000_000_000_001n), /invalid child gas grant/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('companion refuses transaction tools while Sepolia writes are disabled', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'act-readonly-'));
  const companion = new RuntimeCompanion({ runtimeRoot: directory, rootId: '1', rpcUrl: 'http://127.0.0.1:1',
    controller: controllerA, upstream: 'http://127.0.0.1:1/v1', upstreamKey: 'synthetic-host-only',
    imageId: `sha256:${'a'.repeat(64)}`, models: ['gpt-6-luna'], workerUid: process.getuid(),
    workerGid: process.getgid(), childGasWei: 0n, writesEnabled: false });
  await new Promise(resolve => companion.tools.listen(0, '127.0.0.1', resolve));
  const token = companion.sessions.issue(scope, Date.now() + 10000);
  try {
    const response = await fetch(`http://127.0.0.1:${companion.tools.address().port}/v1/tools/spawnChild`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ operationKey, task: 'synthetic', model: 'gpt-6-luna', asset: controllerB,
        amount: '1', restrictions: {} })
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await new Promise(resolve => companion.tools.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
