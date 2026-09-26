const WIDTH = 960;
const CARD_HEIGHT = 96;
const ROW_GAP = 22;
const START_Y = 142;

function xml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function short(value, length = 44) {
  const input = String(value);
  return input.length > length ? `${input.slice(0, length - 1)}…` : input;
}

function amount(raw) {
  const value = BigInt(raw);
  const integer = value / 1_000_000n;
  const decimal = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${integer.toLocaleString('en-US')}${decimal ? `.${decimal}` : ''}`;
}

function sortedNodes(tree) {
  const byParent = new Map();
  for (const node of tree.nodes) {
    const key = String(node.parentId);
    const siblings = byParent.get(key) ?? [];
    siblings.push(node);
    byParent.set(key, siblings);
  }
  const ordered = [];
  const seen = new Set();
  function visit(node, depth) {
    const key = String(node.id);
    if (seen.has(key) || depth > 2) throw new Error('Invalid tree topology');
    seen.add(key);
    ordered.push({ node, depth });
    for (const child of byParent.get(key) ?? []) visit(child, depth + 1);
  }
  const roots = byParent.get('0') ?? [];
  if (roots.length !== 1) throw new Error('Expected one root node');
  visit(roots[0], 0);
  if (seen.size !== tree.nodes.length) throw new Error('Disconnected tree node');
  return ordered;
}

export function treeAsMermaid(tree) {
  const lines = ['flowchart TD'];
  for (const { node } of sortedNodes(tree)) {
    const label = short(node.ensName, 55).replace(/[^a-zA-Z0-9 ._-]/g, '');
    const state = !node.revoked && BigInt(node.generation) === BigInt(tree.generation) &&
      BigInt(node.effectivePolicy.expiry) > BigInt(tree.source.timestamp) ? 'active' : 'inactive';
    lines.push(`  n${node.id}["${label}<br/>${state} · ${amount(node.balances[0])} USDC"]`);
    if (BigInt(node.parentId) !== 0n) lines.push(`  n${node.parentId} --> n${node.id}`);
  }
  return lines.join('\n');
}

export function treeAsSvg(tree) {
  const ordered = sortedNodes(tree);
  const height = START_Y + ordered.length * (CARD_HEIGHT + ROW_GAP) + 52;
  const positions = new Map(ordered.map(({ node, depth }, index) => [String(node.id), {
    x: 34 + depth * 58,
    y: START_Y + index * (CARD_HEIGHT + ROW_GAP)
  }]));
  const edges = ordered.filter(({ node }) => BigInt(node.parentId) !== 0n).map(({ node }) => {
    const parent = positions.get(String(node.parentId));
    const child = positions.get(String(node.id));
    const branchX = child.x - 25;
    const startY = parent.y + CARD_HEIGHT / 2;
    const endY = child.y + CARD_HEIGHT / 2;
    return `<path d="M ${parent.x + 4} ${startY} H ${branchX} Q ${branchX - 7} ${startY} ${branchX - 7} ${startY + 7} V ${endY - 7} Q ${branchX - 7} ${endY} ${branchX} ${endY} H ${child.x}" fill="none" stroke="#59a7a7" stroke-width="2.5"/><circle cx="${branchX}" cy="${endY}" r="4" fill="#58dec3"/>`;
  }).join('');
  const cards = ordered.map(({ node, depth }) => {
    const { x, y } = positions.get(String(node.id));
    const width = WIDTH - x - 34;
    const active = !node.revoked && BigInt(node.generation) === BigInt(tree.generation) &&
      BigInt(node.effectivePolicy.expiry) > BigInt(tree.source.timestamp);
    const status = active ? 'ACTIVE' : node.revoked ? 'REVOKED' : 'INACTIVE';
    const accent = active ? '#58dec3' : '#ffad78';
    const selected = tree.selectedNodeId !== undefined && String(node.id) === String(tree.selectedNodeId);
    const role = depth === 0 ? 'ROOT' : `LEVEL ${depth + 1}`;
    const actions = (node.authorizedActions ?? []).slice(0, 4).join(' · ') || 'no active actions';
    const vault = `${String(node.vault).slice(0, 8)}…${String(node.vault).slice(-6)}`;
    const detailsX = x + 24;
    return `<g>
      <rect x="${x}" y="${y}" width="${width}" height="${CARD_HEIGHT}" rx="17" fill="${selected ? '#1c3145' : '#18243a'}" stroke="${selected ? '#58dec3' : '#35455e'}" stroke-width="${selected ? 3 : 1}"/>
      <rect x="${x}" y="${y + 15}" width="4" height="66" rx="2" fill="${accent}"/>
      <text x="${detailsX}" y="${y + 29}" fill="#7e9bc1" font-size="13" font-weight="700" letter-spacing="1.1">${role} · #${xml(node.id)}${selected ? ' · SELECTED' : ''}</text>
      <text x="${detailsX}" y="${y + 58}" fill="#f0f6ff" font-size="21" font-weight="650">${xml(short(node.ensName, 43))}</text>
      <text x="${detailsX}" y="${y + 80}" fill="#a6b7cf" font-size="13">Vault ${xml(vault)}  ·  ${xml(short(actions, 57))}</text>
      <text x="${x + width - 20}" y="${y + 29}" fill="${accent}" font-size="12" font-weight="700" text-anchor="end" letter-spacing="1">${status}</text>
      <text x="${x + width - 20}" y="${y + 58}" fill="#f0f6ff" font-size="17" font-weight="650" text-anchor="end">${xml(amount(node.balances[0]))} USDC</text>
      <text x="${x + width - 20}" y="${y + 80}" fill="#a6b7cf" font-size="13" text-anchor="end">${xml(amount(node.balances[1]))} DEMO-USD</text>
    </g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" aria-label="Agent Capital Tree root ${xml(tree.rootId)} at Sepolia block ${xml(tree.source.blockNumber)}">
    <rect width="${WIDTH}" height="${height}" fill="#0d1527"/>
    <circle cx="882" cy="58" r="82" fill="#173b55" opacity=".34"/>
    <circle cx="844" cy="66" r="47" fill="#285b67" opacity=".24"/>
    <text x="34" y="52" fill="#f0f6ff" font-family="Segoe UI, Arial, sans-serif" font-size="27" font-weight="700">Agent Capital Tree</text>
    <text x="34" y="80" fill="#a6b7cf" font-family="Segoe UI, Arial, sans-serif" font-size="15">Root #${xml(tree.rootId)} · ${ordered.length} agent${ordered.length === 1 ? '' : 's'} · Ethereum Sepolia</text>
    <text x="34" y="111" fill="#58dec3" font-family="Segoe UI, Arial, sans-serif" font-size="13">LIVE READ  ·  BLOCK ${xml(tree.source.blockNumber)}  ·  ${xml(tree.source.observedAt)}</text>
    <g font-family="Segoe UI, Arial, sans-serif">${edges}${cards}</g>
    <text x="34" y="${height - 23}" fill="#7288a4" font-family="Segoe UI, Arial, sans-serif" font-size="12">Read-only snapshot · Test-USDC on Sepolia · No transaction submitted</text>
  </svg>`;
}

export async function treeAsPng(tree) {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(treeAsSvg(tree))).png({ compressionLevel: 9 }).toBuffer();
}
