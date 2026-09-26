import { WIDTH, t, text, rect, frame, lines, amount } from './visual-primitives.mjs';
import { svgAsPng } from './png-renderer.mjs';
import { nodeStatus, expiryLabel } from './kanoki-format.mjs';
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
  if (nodeStatus(tree, node) === 'revoked') return 'REVOKED';
  if (BigInt(node.generation) !== BigInt(tree.generation)) return 'STALE MANDATE';
  if (BigInt(node.effectivePolicy.expiry) <= BigInt(tree.source.timestamp)) return 'EXPIRED';
  return node.authorizedActions?.length ? 'ONCHAIN RIGHTS' : 'NO ACTIVE RIGHTS';
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
  let cursor = tree.mcp ? 480 : 266;
  const positions = new Map();
  for (const { node, depth } of ordered) {
    const nameLines = lines(node.ensName, 58-depth*4);
    const rights = lines((nodeStatus(tree, node) === 'active' ? node.authorizedActions : []).join(' · ') || 'No currently authorized actions', 90-depth*5);
    const height = 192 + nameLines.length*24 + rights.length*20;
    positions.set(String(node.id), { x: 32+depth*32, y: cursor, height, nameLines, rights });
    cursor += height+32;
  }
  const total = tree.nodes.reduce((sum, node) => sum+BigInt(node.balances[0]), 0n);
  let body = rect(32, 167, 976, 76, t.soft);
  body += text(52, 191, 'FREE TEST-USDC ACROSS VAULTS', { size: 13, color:t.mutedForeground, mono:true });
  body += text(52, 222, amount(total)+' USDC', { size: 20, weight:500, mono:true, color:t.goldInk });
  body += text(438, 191, 'NODES', { size: 13, color:t.mutedForeground, mono:true });
  body += text(438, 222, all.length, { size: 20, weight:500, mono:true });
  body += text(622, 191, `BLOCK ${tree.source.blockNumber}`, { size: 13, color:t.primary, mono:true });
  body += text(622, 218, tree.source.observedAt, { size:13, mono:true, color:t.mutedForeground });
  if (tree.mcp) {
    const m = tree.mcp;
    body += rect(32, 257, 976, 202, t.card, m.writeReady ? t.ring : t.border);
    body += text(52, 282, `MCP ROOT #${m.activeMcpRootId} · VIEWED ROOT #${tree.rootId} · ${m.writeReady ? 'SETUP READY / ACTION CHECK REQUIRED' : 'NOT WRITE-READY'}`, {size:13,weight:600,color:m.writeReady?t.primary:t.mutedForeground});
    body += text(52, 309, `Onchain operator  ${tree.operator}`, {size:13,mono:true});
    body += text(52, 334, `Local MCP signer  ${m.localOperator ?? 'Not prepared / not selected for this tree'}`, {size:13,mono:true});
    body += text(52, 359, `Signer match: ${m.checks?.operatorBound ? 'YES' : 'NO'}   Local gas (wei): ${m.operatorGasWei ?? 'NOT CHECKED'}`, {size:13,mono:true,color:t.mutedForeground});
    body += text(52, 384, `Missing: ${m.missing?.join(', ') || (String(m.activeMcpRootId)!==String(tree.rootId)?'Explicitly select this root before actions':'None; per-action simulation remains required')}`, {size:13,color:t.mutedForeground});
    body += text(52, 410, 'Chat-managed vaults · This MCP launches no autonomous worker process', {size:13,color:t.primary});
    body += text(52, 436, `Controller ${m.controller ?? 'See deployment manifest'}`, {size:13,mono:true,color:t.mutedForeground});
  }
  for (const { node, depth } of ordered) {
    const p = positions.get(String(node.id)), parent = positions.get(String(node.parentId));
    const width = WIDTH-p.x-32, selected = String(tree.selectedNodeId) === String(node.id);
    const status = state(tree, node), accent = status === 'ONCHAIN RIGHTS' ? t.primary : status === 'REVOKED' ? t.destructive : t.mutedForeground;
    if (parent) body += `<path d="M ${parent.x+14} ${parent.y+parent.height} V ${p.y+30} H ${p.x}" fill="none" stroke="${t.border}" stroke-width="1" ${status==='REVOKED'?'stroke-dasharray="4 4"':''}/>`;
    body += rect(p.x,p.y,width,p.height,status==='REVOKED'?t.signalSoft:selected?t.accent:depth===0?t.goldSoft:t.card,selected?t.ring:depth===0?t.gold:t.border);
    body += `<circle cx="${p.x+28}" cy="${p.y+28}" r="8" fill="${depth===0?t.gold:'none'}" stroke="${depth===0?t.gold:t.primary}"/>`;
    body += text(p.x+60,p.y+32,`${depth===0?'ROOT':`LEVEL ${depth+1}`} · #${node.id}${selected?' · SELECTED':''}`,{size:13,color:t.mutedForeground,mono:true});
    body += text(p.x+60,p.y+53,BigInt(node.parentId)?`Parent #${node.parentId}${parent?'':' · previous page'}`:`Owner ${tree.owner ?? 'unavailable'}`,{size:13,mono:true,color:t.mutedForeground});
    body += text(p.x+width-20,p.y+32,status,{size:13,color:accent,anchor:'end',weight:600});
    body += text(p.x+width-20,p.y+75,`${amount(node.balances[0])} USDC`,{size:20,mono:true,anchor:'end',color:t.goldInk});
    body += text(p.x+width-20,p.y+99,`${amount(node.balances[1])} DEMO-USD (test asset)`,{size:13,mono:true,anchor:'end',color:t.mutedForeground});
    p.nameLines.forEach((line,i)=>{body+=text(p.x+20,p.y+124+i*24,line.toLowerCase(),{size:13,mono:true});});
    const baseY = p.y+124+p.nameLines.length*24;
    body += text(p.x+20,baseY,`Vault ${node.vault}`,{size:13,mono:true,color:t.mutedForeground});
    body += `<path d="M ${p.x+20} ${baseY+15} H ${p.x+width-20}" stroke="${t.border}"/>`;
    const granted = nodeStatus(tree, node) === 'active' ? node.authorizedActions ?? [] : [];
    const caps = [['DELEGATE',granted.includes('delegate')],['SWAP',granted.includes('swap')],['LIQUIDITY',granted.some(a=>['lpManage','collectFees','exit'].includes(a))],['PAY',granted.includes('pay')]];
    let capX = p.x+20;
    for (const [label,active] of caps) {
      const capWidth = label.length*7+16;
      body += `<g opacity="${active?1:.5}">`;
      if(active) body += rect(capX,baseY+24,capWidth,20,t.card,t.border,4);
      body += text(capX+8,baseY+38,label,{size:11,mono:true,color:active?t.primary:t.mutedForeground})+'</g>';
      capX += capWidth+8;
    }
    body += text(p.x+width-20,baseY+38,expiryLabel(node.effectivePolicy.expiry,tree.source.timestamp),{size:13,mono:true,color:t.mutedForeground,anchor:'end'});
    p.rights.forEach((line,i)=>{body+=text(p.x+20,baseY+64+i*20,line,{size:13,color:t.mutedForeground});});
  }
  return frame(cursor+37,'Agent tree',`Root #${tree.rootId} · On-chain permissions and balances · Page ${page+1}/${pages}`,body,
    'One chain snapshot · Rights are checked at this block; they do not indicate a running agent process.');
}

export const treeAsPng = (tree, page = 0) => svgAsPng(treeAsSvg(tree, page));
