import assert from 'node:assert/strict';
import { assertExpectedWalletAddress } from './lib/wallet-address.mjs';

const expected = '0x1234567890abcdef1234567890abcdef12345678';
assert.doesNotThrow(() => assertExpectedWalletAddress(expected.toUpperCase().replace('0X', '0x'), expected));
assert.throws(() => assertExpectedWalletAddress('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', expected), /does not match/);
assert.throws(() => assertExpectedWalletAddress(undefined, expected), /does not match/);
console.log('Expected wallet accepted; mismatched and missing accounts rejected');
