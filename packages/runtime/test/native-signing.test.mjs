// Runs unchanged on Linux and native macOS; real local keys/signatures, no RPC or funds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { recoverTransactionAddress, recoverTypedDataAddress, parseTransaction } from 'viem';
import { WorkerKeyStore } from '../dist/keys.js';

const supported = ['linux', 'darwin'].includes(process.platform);
test('native capital bundle starts with an empty private home and no companion or provider', { skip: !supported }, async () => {
  const home = await mkdtemp(join(await realpath(tmpdir()), 'kanoki-native-home-'));
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath,
      [fileURLToPath(new URL('../../plugin/capital.mjs', import.meta.url)), 'check'],
      { env: { ...process.env, HOME: home }, timeout: 20000 });
    assert.equal(stderr, '');
    const result = JSON.parse(stdout);
    assert.equal(result.activeMcpRootId, null);
    assert.equal(result.writeReady, false);
    assert.equal(result.transactionSubmitted, false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('persisted local signer produces valid Sepolia transaction and USDC authorization signatures', { skip: !supported }, async () => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'kanoki-native-signing-'));
  try {
    const created = await new WorkerKeyStore(directory).account('root-7', true);
    const account = await new WorkerKeyStore(directory).account('root-7');
    assert.equal(account.address, created.address);
    const serialized = await account.signTransaction({ chainId: 11155111, type: 'eip1559',
      nonce: 0, to: '0x1111111111111111111111111111111111111111', value: 0n,
      gas: 21000n, maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 1000000n });
    assert.equal(await recoverTransactionAddress({ serializedTransaction: serialized }), account.address);
    assert.equal(parseTransaction(serialized).chainId, 11155111);
    const typedData = {
      domain: { name: 'USDC', version: '2', chainId: 11155111, verifyingContract: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' },
      types: { TransferWithAuthorization: [
        { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
      ] }, primaryType: 'TransferWithAuthorization',
      message: { from: account.address, to: '0x1111111111111111111111111111111111111111', value: 10000n,
        validAfter: 0n, validBefore: 1n, nonce: `0x${'ab'.repeat(32)}` },
    };
    const signature = await account.signTypedData(typedData);
    assert.equal(await recoverTypedDataAddress({ ...typedData, signature }), account.address);
    assert.notEqual(await recoverTypedDataAddress({ ...typedData, message: { ...typedData.message, value: 20000n }, signature }), account.address);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
