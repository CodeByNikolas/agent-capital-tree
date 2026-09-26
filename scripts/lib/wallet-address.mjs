export function assertExpectedWalletAddress(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error('MetaMask account does not match the expected test wallet');
  }
}
