// The walkthrough keeps the selected vault or explicit illustrative preview.
export interface TourContext { vault: string; preview?: boolean; }
export const tourSteps = [
  { path: "/", title: "Read the balances", caption: "USDC and the valueless DEMO-USD test asset are separate. A node's authority does not prove that an agent process is running." },
  { path: "/tree", title: "Inspect a node", caption: "Select a node to inspect its balance, capabilities and inherited limits. The tree has at most three levels." },
  { path: "/activity", title: "Check indexed activity", caption: "MultiBaas indexes capital and policy events. Read the coverage and index status before following a transaction receipt. Preview records are illustrative." },
  { path: "/applications", title: "Review applications", caption: "Uniswap positions and x402 services require the relevant capability. DEMO-USD has no monetary value. Payment receipts are separate from controller history." },
  { path: "/setup", title: "Review owner controls", caption: "The owner funds the root and authorizes a local operator. Revocation stops management; funds remain in the vault until a separate recovery action." },
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
