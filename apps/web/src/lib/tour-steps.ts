// The in-product guided walkthrough. Mirrors docs/jury-demo.md so a first-time
// viewer can follow the intended 5-minute demo without any external document.
// State lives entirely in the URL (?tour=1&step=N), so each step survives the
// full-page navigation between the five routes.

export interface TourStep {
  path: string;
  root: string;
  node?: string;
  title: string;
  caption: string;
}

export const tourSteps: readonly TourStep[] = [
  {
    path: "/",
    root: "5",
    title: "Overview of a real tree",
    caption:
      "Capital, permission, and a running agent are three different things. A valid mandate does not prove a runtime is running. This root's funds were later recovered by the owner.",
  },
  {
    path: "/tree",
    root: "5",
    node: "7",
    title: "Inspect the hierarchy",
    caption:
      "root5 → child6 → grandchild7 → sibling8. The grandchild is selected: see the limits it inherits from every ancestor. A child can never exceed a parent.",
  },
  {
    path: "/activity",
    root: "9",
    title: "Indexed proof",
    caption:
      "A real master read indexed activity, reclaimed 1 ACT-A from child10, then allocated 0.5 to sibling11. Follow a receipt link — the coverage boundary shown is real.",
  },
  {
    path: "/applications",
    root: "1",
    title: "Bounded Uniswap v4",
    caption:
      "The one built-in action: bounded swaps and vault-owned liquidity. Managing, collecting fees, and exiting are distinct permissions. This is the seed root — do not modify it.",
  },
  {
    path: "/setup",
    root: "5",
    title: "Owner recovery & runtime",
    caption:
      "The owner has an independent recovery path that ignores ENS, indexer, and runtime. Worker identity comes from isolated runtime credentials plus on-chain authority — never a model-supplied ID.",
  },
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
  params.set("root", target.root);
  if (target.node) params.set("node", target.node);
  params.set("tour", "1");
  params.set("step", String(index + 1));
  return `${target.path}?${params}`;
}

/** Build the href that exits the tour but keeps the viewer on the current step's data. */
export function tourExitHref(step: number): string {
  const target = tourSteps[clampStep(step) - 1];
  const params = new URLSearchParams();
  params.set("root", target.root);
  if (target.node) params.set("node", target.node);
  return `${target.path}?${params}`;
}
