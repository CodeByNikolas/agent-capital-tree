export function mobileTreeOrder<T extends { id: string; parentId: string | null }>(nodes: readonly T[]): T[] {
  const ids = new Set(nodes.map((node) => node.id));
  const ordered: T[] = [];
  const visited = new Set<string>();

  function visit(node: T) {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    ordered.push(node);
    for (const child of nodes) {
      if (child.parentId === node.id) visit(child);
    }
  }

  for (const node of nodes) {
    if (!node.parentId || !ids.has(node.parentId)) visit(node);
  }
  for (const node of nodes) visit(node);
  return ordered;
}
