import { WIDTH, t, text, rect, frame, lines, amount } from './visual-primitives.mjs';
import { svgAsPng } from './png-renderer.mjs';
export const NODES_PER_PAGE = 6;

function sortedNodes(tree) {
  if (tree.source.chainId !== 11155111) throw new Error('Expected Ethereum Sepolia');
  if (!tree.nodes.length || tree.nodes.length > 32) throw new Error('Expected 1–32 tree nodes');
  const byParent = new Map(), ordered = [], seen = new Set();
  for (const node of tree.nodes) {
    if (!/^\d+$/.test(String(node.id)) || !/^\d+$/.test(String(node.parentId))) throw new Error('Invalid node ID');
    const key = String(node.parentId);
    byParent.set(key, [...(byParent.get(key) ?? []), node]);
  }
  function visit(node, depth) {
    const key = String(node.id);
    if (seen.has(key) || depth > 2) throw new Error('Invalid tree topology');
    seen.add(key); ordered.push({ node, depth });
    for (const child of byParent.get(key) ?? []) visit(child, depth + 1);
  }
  const roots = byParent.get('0') ?? [];
  if (roots.length !== 1) throw new Error('Expected one root node');
  visit(roots[0], 0);
  if (seen.size !== tree.nodes.length) throw new Error('Disconnected tree node');
  return ordered;
}

function state(tree, node) {
  if (node.revoked) return 'REVOKED';
  if (BigInt(node.generation) !== BigInt(tree.generation)) return 'STALE MANDATE';
  if (BigInt(node.effectivePolicy.expiry) <= BigInt(tree.source.timestamp)) return 'EXPIRED';
  return node.authorizedActions?.length ? 'AUTHORIZED' : 'NO ACTIVE RIGHTS';
}

export function treeAsMermaid(tree) {
  const result = ['flowchart TD'];
  for (const { node } of sortedNodes(tree)) {
    const label = String(node.ensName).replace(/[^a-zA-Z0-9 ._-]/g, '');
    result.push(`  n${node.id}["${label}<br/>${state(tree,node)} · ${amount(node.balances[0])} Test-USDC<br/>${(node.authorizedActions ?? []).join(', ') || 'No active rights'}"]`);
    if (BigInt(node.parentId)) result.push(`  n${node.parentId} --> n${node.id}`);
  }
  result.push(`  classDef vault fill:${t.card},stroke:${t.ring},color:${t.foreground}`);
  result.push(`  class ${tree.nodes.map(node => `n${node.id}`).join(',')} vault`);
  return result.join('\n');
}

export function treeAsSvg(tree, page = 0) {
  const all = sortedNodes(tree), pages = Math.ceil(all.length/NODES_PER_PAGE);
  if (!Number.isInteger(page) || page < 0 || page >= pages) throw new Error('Invalid tree page');
  const ordered = all.slice(page*NODES_PER_PAGE, (page+1)*NODES_PER_PAGE);
  let cursor = 266;
  const positions = new Map();
  for (const { node, depth } of ordered) {
    const nameLines = lines(node.ensName, 58-depth*4);
    const rights = lines((node.authorizedActions ?? []).join(' · ') || 'No currently authorized actions', 90-depth*5);
    const height = 126 + nameLines.length*23 + rights.length*20;
    positions.set(String(node.id), { x: 32+depth*38, y: cursor, height, nameLines, rights });
    cursor += height+20;
  }
  const total = tree.nodes.reduce((sum, node) => sum+BigInt(node.balances[0]), 0n);
  let body = rect(32, 167, 976, 76, t.soft);
  body += text(52, 191, 'FREE TEST-USDC ACROSS VAULTS', { size: 12, color:t.mutedForeground, mono:true });
  body += text(52, 222, amount(total), { size: 25, weight:800 });
  body += text(438, 191, 'AGENTS', { size: 12, color:t.mutedForeground, mono:true });
  body += text(438, 222, all.length, { size: 25, weight:800 });
  body += text(622, 191, `BLOCK ${tree.source.blockNumber}`, { size: 13, color:t.primary, mono:true });
  body += text(622, 218, tree.source.observedAt, { size:12, mono:true, color:t.mutedForeground });
  for (const { node, depth } of ordered) {
    const p = positions.get(String(node.id)), parent = positions.get(String(node.parentId));
    const width = WIDTH-p.x-32, selected = String(tree.selectedNodeId) === String(node.id);
    if (parent) body += `<path d="M ${parent.x+14} ${parent.y+parent.height} V ${p.y+30} H ${p.x}" fill="none" stroke="${t.ring}" stroke-width="2"/>`;
    const status = state(tree, node), accent = status === 'AUTHORIZED' ? t.primary : t.destructive;
    body += rect(p.x,p.y,width,p.height,selected?t.accent:t.card,selected?t.ring:t.border);
    body += rect(p.x+18,p.y+18,30,30,t.soft,t.border,7);
    body += text(p.x+33,p.y+39,depth===0?'R':'A',{ size:15, color:t.primary, weight:800, anchor:'middle' });
    body += text(p.x+60,p.y+32,`${depth===0?'ROOT':`LEVEL ${depth+1}`} · #${node.id}${selected?' · SELECTED':''}`,{size:12,color:t.mutedForeground,mono:true});
    body += text(p.x+60,p.y+53,BigInt(node.parentId)?`Parent #${node.parentId}${parent?'':' · previous page'}`:'Owner-authorized root',{size:12,color:t.mutedForeground});
    body += text(p.x+width-20,p.y+32,status,{size:12,color:accent,anchor:'end',weight:800});
    body += text(p.x+width-20,p.y+67,`${amount(node.balances[0])} USDC`,{size:22,mono:true,anchor:'end'});
    body += text(p.x+width-20,p.y+91,`${amount(node.balances[1])} DEMO-USD`,{size:12,mono:true,anchor:'end',color:t.mutedForeground});
    p.nameLines.forEach((line,i)=>{body+=text(p.x+20,p.y+82+i*23,line,{size:17,weight:700});});
    const baseY = p.y+82+p.nameLines.length*23;
    body += text(p.x+20,baseY,`Vault ${node.vault}`,{size:12,mono:true,color:t.mutedForeground});
    body += `<path d="M ${p.x+20} ${baseY+15} H ${p.x+width-20}" stroke="${t.border}"/>`;
    p.rights.forEach((line,i)=>{body+=text(p.x+20,baseY+38+i*20,line,{size:14,color:t.primary});});
  }
  return frame(cursor+37,'Agent tree',`Root #${tree.rootId} · On-chain permissions and balances · Page ${page+1}/${pages}`,body,
    'One chain snapshot · Rights are checked at this block; they do not indicate a running agent process.');
}

export const treeAsPng = (tree, page = 0) => svgAsPng(treeAsSvg(tree, page));
