import type { TokenAmount } from "./dashboard-types";

export function formatAmount(amount: TokenAmount): string {
  const raw = BigInt(amount.rawAmount);
  const scale = 10n ** BigInt(amount.decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(amount.decimals, "0");
  const groupedWhole = whole.toLocaleString("en-US");
  const visibleFraction = fraction.replace(/0+$/, "");
  return visibleFraction ? `${groupedWhole}.${visibleFraction}` : groupedWhole;
}

export function formatCompactAmount(amount: TokenAmount): string {
  const raw = BigInt(amount.rawAmount);
  const scale = 10n ** BigInt(amount.decimals);
  const precision = raw >= scale ? 2 : 4;
  const displayScale = 10n ** BigInt(precision);
  const rounded = (raw * displayScale + scale / 2n) / scale;
  if (raw > 0n && rounded === 0n) return "<0.0001";

  const whole = (rounded / displayScale).toLocaleString("en-US");
  const fraction = (rounded % displayScale).toString().padStart(precision, "0").replace(/0+$/, "");
  const display = fraction ? `${whole}.${fraction}` : whole;
  return display === formatAmount(amount) ? display : `≈${display}`;
}
