import dagre from "@dagrejs/dagre";
import type { VaultNode } from "./dashboard-types";

/** Values mirror CSS tokens during server rendering; callers read live tokens after mount. */
export function layoutTree(nodes: readonly VaultNode[], space = { sibling: 16, level: 32, large: 48 }) {
  const width = space.large * 6, height = space.large * 4 + space.sibling / 2;
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "TB", nodesep: space.sibling, ranksep: space.level, marginx: space.sibling, marginy: space.sibling });
  graph.setDefaultEdgeLabel(() => ({}));
  const visible = nodes.filter(node => node.depth <= 2).slice(0, 32);
  const ids = new Set(visible.map(node => node.id));
  for (const node of visible) graph.setNode(node.id, { width, height });
  for (const node of visible) if (node.parentId && ids.has(node.parentId)) graph.setEdge(node.parentId, node.id);
  dagre.layout(graph);
  const byId = new Map(visible.map(node => [node.id, node]));
  const revoked = (node: VaultNode) => {
    const visited = new Set<string>();
    let cursor: VaultNode | undefined = node;
    while (cursor && !visited.has(cursor.id)) {
      if (cursor.state === "revoked") return true;
      visited.add(cursor.id); cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return false;
  };
  return {
    width: graph.graph().width ?? width, height: graph.graph().height ?? height,
    omittedCount: nodes.length - visible.length,
    nodes: visible.map(node => { const p = graph.node(node.id); return { node: revoked(node) ? { ...node, state: "revoked" as const } : node, left: p.x - width / 2, top: p.y - height / 2 }; }),
    edges: visible.filter(node => node.parentId && ids.has(node.parentId)).map(node => {
      const parent = graph.node(node.parentId!), child = graph.node(node.id);
      const from = parent.y + height / 2, to = child.y - height / 2, middle = (from + to) / 2;
      return { id: node.id, revoked: revoked(node), path: `M ${parent.x} ${from} V ${middle} H ${child.x} V ${to}` };
    }),
  };
}

export function relativeExpiry(expiresAt: string, now: number) {
  const duration = Date.parse(expiresAt) - now;
  if (!Number.isFinite(duration)) return "expiry unavailable";
  if (duration <= 0) return "expired";
  const minutes = Math.ceil(duration / 60000), hours = Math.floor(minutes / 60);
  return hours >= 24 ? `expires in ${Math.floor(hours / 24)}d ${hours % 24}h` : `expires in ${hours}h ${minutes % 60}m`;
}
