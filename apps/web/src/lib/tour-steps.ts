// The walkthrough keeps the selected vault or explicit illustrative preview.
export interface TourContext { vault: string; preview?: boolean; }
export const tourSteps = [
  { path: "/", title: "Overview of a real vault",
    caption: "Read current Sepolia balances and permissions. A valid mandate does not prove that an agent process is running." },
  { path: "/tree", title: "Inspect the capital tree",
    caption: "Select a vault to inspect its ENS name, capital and permissions. New children receive separate custody and may only narrow their parent's mandate." },
  { path: "/agent-activity", title: "Curvegrid indexed activity",
    caption: "MultiBaas indexes this controller's events. Totals cover loaded events only; follow the receipt links and check the coverage boundary." },
  { path: "/uniswap", title: "Bounded Uniswap v4",
    caption: "Inspect this vault's LP positions. USDC and valueless DEMO-USD are separate assets; their test pool price is not a dollar valuation." },
  { path: "/payments", title: "x402 payment receipts",
    caption: "This page shows settlements from the current deployment. Earlier prototype receipts are not imported; preview records are illustrative." },
  { path: "/setup", title: "Owner control and runtime",
    caption: "The owner funds the vault and authorizes an operator. Owner recovery is independent of ENS and the indexer. Viewing the demo neither starts an agent nor signs a transaction." },
] as const;

export const tourStepCount = tourSteps.length;
export function clampStep(step: number | null | undefined): number {
  if (!step || !Number.isFinite(step)) return 1;
  return Math.min(Math.max(Math.trunc(step), 1), tourStepCount);
}
export function tourExitHref(step: number, context: TourContext): string {
  const params = new URLSearchParams(context.preview ? { preview: "1" } : { vault: context.vault });
  return `${tourSteps[clampStep(step) - 1].path}?${params}`;
}
export function tourStepHref(step: number, context: TourContext): string {
  return `${tourExitHref(step, context)}&tour=1&step=${clampStep(step)}`;
}
