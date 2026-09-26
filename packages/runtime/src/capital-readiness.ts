import type { Address } from 'viem';
import type { CapitalTree } from '@agent-capital-tree/sdk';

export const TEST_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as const;

/** Public-only checklist. All chain values must come from the supplied snapshot block. */
export function capitalReadiness(tree: CapitalTree, localOperator: Address | undefined, gasWei: bigint, budgetRaw = 100_000n) {
  if (tree.source.chainId !== 11155111) throw new Error('Expected Ethereum Sepolia');
  if (budgetRaw <= 0n || budgetRaw > 100_000n || gasWei < 0n) throw new Error('Invalid demo budget');
  const root = tree.nodes.find(node => node.id === tree.rootId);
  const index = tree.tokens.findIndex(token => token.toLowerCase() === TEST_USDC.toLowerCase());
  if (!root || index < 0) throw new Error('Expected a Test-USDC root');
  const checks = {
    rootNotRevoked: !root.revoked,
    localKey: Boolean(localOperator),
    operatorBound: Boolean(localOperator && tree.operator.toLowerCase() === localOperator.toLowerCase()),
    delegation: root.authorizedActions.includes('delegate'),
    restriction: root.authorizedActions.includes('restrict'),
    recovery: root.authorizedActions.includes('reclaim'),
    usdcAllowed: Boolean(root.effectivePolicy.tokenMask & (1 << index)),
    usdcLimit: root.effectivePolicy.maxAmounts[index]! >= budgetRaw,
    vaultFunded: tree.totalBalances[index]! >= budgetRaw,
    operatorHasGas: Boolean(localOperator) && gasWei > 0n
  };
  return { mode: 'capital', chainId: 11155111, rootId: tree.rootId, ensName: root.ensName,
    rootRevoked: Boolean(root.revoked),
    ...(root.revoked ? { status: 'unavailable', transactionSubmitted: false,
      next: 'ROOT_REVOKED: This root is permanently revoked. Do not fund it or top up its signer. Operator replacement cannot reactivate it. Select an active root or explicitly create a new one.' } : {}),
    vault: root.vault, owner: tree.owner, boundOperator: tree.operator, localOperator: localOperator ?? null,
    budgetRaw, usdcBalanceRaw: root.balances[index], usdcLimitRaw: root.effectivePolicy.maxAmounts[index],
    totalUsdcBalanceRaw: tree.totalBalances[index],
    fundingShortfallRaw: budgetRaw > tree.totalBalances[index]! ? budgetRaw - tree.totalBalances[index]! : 0n,
    onchainRights: root.authorizedActions, operatorGasAddress: localOperator ?? null,
    operatorGasWei: localOperator ? gasWei : null, checks, missing: Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name),
    prerequisitesMet: Object.values(checks).every(Boolean), source: tree.source,
    gasNote: 'A positive ETH balance is not a gas estimate. Each transaction still requires simulation and sufficient fees. USDC approval is not an ETH transfer.',
    inference: 'Current chat; no background worker, Docker, CLIProxyAPI or model API key required.' };
}
