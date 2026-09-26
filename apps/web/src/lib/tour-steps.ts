// The in-product guided walkthrough. Mirrors docs/jury-demo.md so a first-time
// viewer can follow the intended 5-minute demo without any external document.
// State lives entirely in the URL (?tour=1&step=N), so each step survives the
// full-page navigation between routes.

export interface TourStep {
  path: string;
  vault: string;
  node?: string;
  title: string;
  caption: string;
}

export const tourSteps: readonly TourStep[] = [
  { path: "/", vault: "capital.kanoki.eth", title: "Overview of a real vault",
    caption: "Read current Sepolia balances and permissions. A valid mandate does not prove that an agent process is running." },
  { path: "/tree", vault: "capital.kanoki.eth", title: "Inspect the capital tree",
    caption: "Select a vault to inspect its ENS name, capital and permissions. New children receive separate custody and may only narrow their parent's mandate." },
  { path: "/agent-activity", vault: "capital.kanoki.eth", title: "Curvegrid indexed activity",
    caption: "MultiBaas indexes this controller's events. Totals cover loaded events only; follow the receipt links and check the coverage boundary." },
  { path: "/uniswap", vault: "capital.kanoki.eth", title: "Bounded Uniswap v4",
    caption: "Inspect the new demo vault's LP position. USDC and valueless DEMO-USD are separate assets; their test pool price is not a dollar valuation." },
  { path: "/payments", vault: "capital.kanoki.eth", title: "x402 payment receipts",
    caption: "This page shows settlements from the current deployment. It stays empty until a new payment occurs; earlier prototype receipts are not imported." },
  { path: "/setup", vault: "capital.kanoki.eth", title: "Owner control and runtime",
    caption: "The owner funds the vault and authorizes an operator. Owner recovery is independent of ENS and the indexer. Viewing the demo neither starts an agent nor signs a transaction." },
];

export const tourStepCount = tourSteps.length;

/** Clamp an arbitrary incoming step number to a valid 1-based index. */
export function clampStep(step: number | null | undefined): number {
  if (!step || Number.isNaN(step)) return 1;
  return Math.min(Math.max(Math.trunc(step), 1), tourStepCount);
}

/** Build the href for a 1-based tour step, carrying its root/node + tour params. */
export function tourStepHref(step: number): string {
  const index = clampStep(step) - 1;
  const target = tourSteps[index];
  const params = new URLSearchParams();
  params.set("vault", target.vault);
  if (target.node) params.set("node", target.node);
  params.set("tour", "1");
  params.set("step", String(index + 1));
  return `${target.path}?${params}`;
}

/** Build the href that exits the tour but keeps the viewer on the current step's data. */
export function tourExitHref(step: number): string {
  const target = tourSteps[clampStep(step) - 1];
  const params = new URLSearchParams();
  params.set("vault", target.vault);
  if (target.node) params.set("node", target.node);
  return `${target.path}?${params}`;
}
