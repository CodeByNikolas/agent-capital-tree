import assert from 'node:assert/strict';
import { verifyWalletBeforeReady } from './lib/wallet-address.mjs';

const expected = '0x1234567890abcdef1234567890abcdef12345678';
const mixedCase = '0x1234567890ABCDEF1234567890abcdef12345678';
const readyMarkers = [];
const fakeMetaMask = accounts => ({ readAccounts: async () => accounts });
await verifyWalletBeforeReady(fakeMetaMask([mixedCase]).readAccounts,
  expected, address => readyMarkers.push(address));
await assert.rejects(verifyWalletBeforeReady(fakeMetaMask(['0xabcdefabcdefabcdefabcdefabcdefabcdefabcd']).readAccounts,
  expected, address => readyMarkers.push(address)), /does not match/);
await assert.rejects(verifyWalletBeforeReady(fakeMetaMask([]).readAccounts,
  expected, address => readyMarkers.push(address)), /does not match/);
assert.deepEqual(readyMarkers, [mixedCase], 'a mismatch must not record readiness');
console.log('Fake MetaMask account accepted; mismatched and missing accounts do not record readiness');
