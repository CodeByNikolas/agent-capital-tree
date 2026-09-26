import type { IndexedCapitalActivity } from "./dashboard-types";

export function agentEvents(items: readonly IndexedCapitalActivity[], nodeId: string, rootId: string) {
  return items.filter(item => {
    if (item.kind === "capital_allocated" || item.kind === "capital_reclaimed") return item.parentId === nodeId || item.childId === nodeId;
    if ("nodeId" in item) return item.nodeId === nodeId;
    return nodeId === rootId;
  });
}

export const flowLabels = {
  funded: "Root funding", received: "Allocations received", delegated: "Delegated to children",
  returned: "Returned to parent", reclaimed: "Reclaimed from children", recovered: "Owner recovery",
  swapIn: "Swap input", swapOut: "Swap output",
} as const;

export function summarizeAgentEvents(items: readonly IndexedCapitalActivity[], nodeId: string, rootId: string) {
  const totals = new Map<string, { kind: keyof typeof flowLabels; token: string; rawAmount: bigint }>();
  const add = (kind: keyof typeof flowLabels, token: string, amount: string) => {
    const key = `${kind}:${token.toLowerCase()}`;
    const previous = totals.get(key);
    totals.set(key, { kind, token: token.toLowerCase(), rawAmount: (previous?.rawAmount ?? 0n) + BigInt(amount) });
  };
  const seen = new Set<string>();
  for (const item of agentEvents(items, nodeId, rootId)) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    switch (item.kind) {
      case "root_funded": add("funded", item.token, item.amount); break;
      case "capital_allocated": add(item.childId === nodeId ? "received" : "delegated", item.token, item.amount); break;
      case "capital_reclaimed": add(item.childId === nodeId ? "returned" : "reclaimed", item.token, item.amount); break;
      case "emergency_recovered": add("recovered", item.token, item.amount); break;
      case "swap_executed": add("swapIn", item.inputToken, item.amountIn); add("swapOut", item.outputToken, item.amountOut); break;
    }
  }
  return [...totals.values()];
}
