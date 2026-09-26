import type { Address } from 'viem';
import type { CapitalTree } from '@agent-capital-tree/sdk';

export const TEST_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as const;

/** Public-only checklist. All chain values must come from the supplied snapshot block. */
export function capitalReadiness(tree: CapitalTree, localOperator: Address | undefined, gasWei: bigint, budgetRaw = 50_000n) {
  if (tree.source.chainId !== 11155111) throw new Error('Expected Ethereum Sepolia');
  if (budgetRaw <= 0n || budgetRaw > 100_000n || gasWei < 0n) throw new Error('Invalid demo budget');
  const root = tree.nodes.find(node => node.id === tree.rootId);
  const index = tree.tokens.findIndex(token => token.toLowerCase() === TEST_USDC.toLowerCase());
  if (!root || index < 0) throw new Error('Expected a Test-USDC root');
  const checks = {
    localKey: Boolean(localOperator),
    operatorBound: Boolean(localOperator && tree.operator.toLowerCase() === localOperator.toLowerCase()),
    delegation: root.authorizedActions.includes('delegate'),
    restriction: root.authorizedActions.includes('restrict'),
    recovery: root.authorizedActions.includes('reclaim'),
    usdcAllowed: Boolean(root.effectivePolicy.tokenMask & (1 << index)),
    usdcLimit: root.effectivePolicy.maxAmounts[index]! >= budgetRaw,
    vaultFunded: root.balances[index]! >= budgetRaw,
    operatorHasGas: gasWei > 0n
  };
  return { mode: 'capital', chainId: 11155111, rootId: tree.rootId, ensName: root.ensName,
    vault: root.vault, owner: tree.owner, boundOperator: tree.operator, localOperator: localOperator ?? null,
    budgetRaw, usdcBalanceRaw: root.balances[index], usdcLimitRaw: root.effectivePolicy.maxAmounts[index],
    operatorGasWei: gasWei, checks, missing: Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name),
    prerequisitesMet: Object.values(checks).every(Boolean), source: tree.source,
    gasNote: 'A positive ETH balance is not a gas estimate. Each transaction still requires simulation and sufficient fees. USDC approval is not an ETH transfer.',
    inference: 'Current chat; no background worker, Docker, CLIProxyAPI or model API key required.' };
}
