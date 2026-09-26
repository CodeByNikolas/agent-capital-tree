export function assertExpectedWalletAddress(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error('MetaMask account does not match the expected test wallet');
  }
}

export async function verifyWalletBeforeReady(readAccounts, expected, onReady) {
  const [actual] = await readAccounts();
  assertExpectedWalletAddress(actual, expected);
  await onReady(actual);
  return actual;
}
