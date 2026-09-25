import type { Address, Hex } from 'viem';

export const financeRoles = {
  delegate: 1n << 40n, swap: 1n << 44n, lpManage: 1n << 48n,
  collectFees: 1n << 52n, exit: 1n << 56n, restrict: 1n << 60n, reclaim: 1n << 64n,
} as const;
export type Capability = keyof typeof financeRoles;
export type Policy = {
  capabilities: bigint; maxAmounts: readonly [bigint, bigint]; expiry: bigint;
  tokenMask: number; poolId: Hex;
};
export type Restrictions = {
  capabilities?: readonly Capability[];
  expiresAt?: number;
  allowedAssets?: readonly Address[];
  maxPerAction?: Readonly<Record<string, string>>;
};

/** Convert raw-unit restrictions, rejecting expansions before submitting a transaction. */
export function narrowPolicy(parent: Policy, restrictions: Restrictions, tokens: readonly [Address, Address]): Policy {
  const policy: Policy = { ...parent, maxAmounts: [...parent.maxAmounts] };
  if (restrictions.capabilities) {
    policy.capabilities = restrictions.capabilities.reduce((mask, role) => {
      if (!(role in financeRoles)) throw new Error('Unknown capability');
      return mask | financeRoles[role];
    }, 0n);
  }
  if (restrictions.expiresAt !== undefined) {
    if (!Number.isSafeInteger(restrictions.expiresAt) || restrictions.expiresAt <= 0) throw new Error('Invalid expiry');
    policy.expiry = BigInt(restrictions.expiresAt);
  }
  if (restrictions.allowedAssets) {
    policy.tokenMask = restrictions.allowedAssets.reduce((mask, token) => mask | (1 << tokenIndex(tokens, token)), 0);
  }
  const maxima: [bigint, bigint] = [...parent.maxAmounts];
  for (const [token, amount] of Object.entries(restrictions.maxPerAction ?? {})) {
    maxima[tokenIndex(tokens, token)] = rawAmount(amount);
  }
  if (!(policy.tokenMask & 1)) maxima[0] = 0n;
  if (!(policy.tokenMask & 2)) maxima[1] = 0n;
  policy.maxAmounts = maxima;
  if ((policy.capabilities & ~parent.capabilities) !== 0n || (policy.tokenMask & ~parent.tokenMask) !== 0 ||
    policy.expiry > parent.expiry || maxima[0] > parent.maxAmounts[0] || maxima[1] > parent.maxAmounts[1]) {
    throw new Error('Restrictions cannot expand the parent mandate');
  }
  return policy;
}

export function rawAmount(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('Expected raw token units');
  const amount = BigInt(value);
  if (amount >= (1n << 256n)) throw new Error('Amount exceeds uint256');
  return amount;
}

export function tokenIndex(tokens: readonly [Address, Address], token: string): 0 | 1 {
  const index = tokens.findIndex(candidate => candidate.toLowerCase() === token.toLowerCase());
  if (index !== 0 && index !== 1) throw new Error('Asset is not configured');
  return index;
}

export function tokenAmounts(tokens: readonly [Address, Address], token: string, amount: string): [bigint, bigint] {
  const amounts: [bigint, bigint] = [0n, 0n];
  amounts[tokenIndex(tokens, token)] = rawAmount(amount);
  return amounts;
}
