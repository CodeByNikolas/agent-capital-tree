import type { TokenAmount } from "./dashboard-types";

/** Exact values remain available for inspection; never use display rounding for transactions. */
export function formatExactAmount(amount: TokenAmount): string {
  const raw = BigInt(amount.rawAmount);
  const sign = raw < 0n ? "-" : "";
  const absolute = raw < 0n ? -raw : raw;
  const scale = 10n ** BigInt(amount.decimals);
  const fraction = (absolute % scale).toString().padStart(amount.decimals, "0").replace(/0+$/, "");
  return `${sign}${(absolute / scale).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

/** Three-decimal ERC-20 presentation, calculated entirely with integers. */
export function formatAmount(amount: TokenAmount): string {
  const raw = BigInt(amount.rawAmount);
  const sign = raw < 0n ? "-" : "";
  const absolute = raw < 0n ? -raw : raw;
  const scale = 10n ** BigInt(amount.decimals);
  if (absolute > 0n && absolute * 1000n < scale) return raw < 0n ? ">-0.001" : "<0.001";
  const rounded = (absolute * 1000n + scale / 2n) / scale;
  return `${sign}${(rounded / 1000n).toLocaleString("en-US")}.${(rounded % 1000n).toString().padStart(3, "0")}`;
}

export const formatRoundedAmount = formatAmount;
export const formatCompactAmount = formatAmount;
