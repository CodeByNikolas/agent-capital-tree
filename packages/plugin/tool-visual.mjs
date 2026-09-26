import { t, frame, text, rect, lines, short, amount } from './visual-primitives.mjs';
import { resultMarkdown } from './kanoki-format.mjs';
import { svgAsPng } from './png-renderer.mjs';
import { treeAsMermaid, treeAsPng, NODES_PER_PAGE } from './tree-visual.mjs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const DISPLAY_INSTRUCTIONS = 'Every tool response includes dashboard-style PNG images and ready-to-use Markdown image links to real local files. Always copy ALL supplied Markdown image links into your final chat answer, including setup, action receipts and errors; do not replace them with a prose-only answer or require a separate visualizeTree call. Preserve the supplied status and block/time. If this host cannot display local images, render the provided Mermaid fallback and explicitly say that image rendering is unavailable. Never invent an attachment URL.';
let imageDirectory;
async function imageLink(png, title) {
  imageDirectory ??= mkdtemp(join(tmpdir(),'act-mcp-visuals-'));
  const file=join(await imageDirectory,`${createHash('sha256').update(png).digest('hex').slice(0,24)}.png`);
  await writeFile(file,png,{mode:0o600});
  const displayPath=process.platform==='linux' && /^[a-zA-Z0-9._-]+$/.test(process.env.WSL_DISTRO_NAME??'')
    ? `//wsl.localhost/${process.env.WSL_DISTRO_NAME}${file}` : file.replaceAll('\\','/');
  return `![${title}](<${displayPath}>)`;
}
const titles = {
  getTree: 'Agent tree', visualizeTree: 'Agent tree', prepareRootSetup: 'Create your root vault',
  getEffectivePolicy: 'Mandate and limits', getCapitalActivity: 'Capital activity',
  getOperationStatus: 'Operation status', spawnChild: 'Create a child agent', createChildVault: 'Create a child vault',
  getCapitalSetup: 'Capital demo readiness', prepareCapitalSetup: 'Authorize your chat agent',
  selectCapitalRoot: 'Select the MCP root', prepareOperatorRecovery: 'Recover local agent access',
  getPaymentServices: 'Available services', purchaseService: 'Service payment',
  allocateCapital: 'Delegate capital', tightenPolicy: 'Restrict permissions', swap: 'Vault swap',
  openPosition: 'Open liquidity position', increasePosition: 'Add liquidity', collectFees: 'Collect fees',
  closePosition: 'Close liquidity position', revokeSubtree: 'Revoke agent branch', reclaimAssets: 'Recover remaining capital'
};
const rights = ['delegate', 'swap', 'lpManage', 'collectFees', 'exit', 'restrict', 'reclaim', 'pay'];
const scalar = value => ['string','number','bigint','boolean'].includes(typeof value);

export function toolView(name, args, data, { readOnly = true, isError = false, phase, receivedAt = new Date().toISOString() } = {}) {
  const d = data && typeof data === 'object' ? data : {};
  const view = { title: titles[name] ?? 'MCP request', tool: name in titles ? name : 'unknown tool', receivedAt,
    status: isError ? (phase === 'validation' ? 'REQUEST REJECTED' : readOnly ? 'READ UNAVAILABLE' : 'OUTCOME UNCONFIRMED') : readOnly ? 'DATA RECEIVED' : 'RESULT RECEIVED',
    error: isError, rows: [], next: readOnly ? 'Use the returned data with its stated coverage and freshness.' : 'Read the updated tree before the next action.' };
  const row = (label, value) => { if (scalar(value)) view.rows.push([label, short(value, 240)]); };
  if (isError) {
    const known = String(data).split(':')[0];
    if (['ROOT_NOT_FOUND','SIGNER_MISMATCH','PROFILE_MISSING','GAS_MISSING','WRONG_TARGET_ROOT','WRONG_CHAIN','OPERATOR_RECOVERY_REQUIRED','BINDING_CHANGED'].includes(known)) view.status = known.replaceAll('_',' ');
    row('Details', data);
    view.next = phase === 'validation' ? 'Correct the arguments. The handler was not executed.' : readOnly
      ? 'Retry the read once the connection is available.'
      : 'Reconcile operation status and chain state before retrying. A timeout does not prove failure.';
    return view;
  }
  if (d.status === 'blocked' || d.status === 'unavailable') {
    view.status = 'NOT EXECUTED'; row('Details', d.next); row('Transaction submitted', d.transactionSubmitted);
    view.next = d.next ?? view.next;
    return view;
  }
  if (['getCapitalSetup','prepareCapitalSetup','selectCapitalRoot','prepareOperatorRecovery'].includes(name)) {
    view.status = d.prerequisitesMet ? 'CHAIN CHECKS PASSED · REVIEW GAS FEES' : 'SETUP INCOMPLETE · NO TRANSACTION';
    row('Vault / active MCP root', `${d.ensName} / #${d.activeMcpRootId}`); row('LOCAL ETH gas (wei)', d.operatorGasWei ?? 'Not checked: local signer missing');
    row('Onchain operator', d.boundOperator);
    row('Controller', d.controller);
    row('Onchain rights', d.onchainRights?.join(', ') || 'None');
    row('Local signer / match', `${d.localOperator ?? 'Not prepared'} / ${d.checks?.operatorBound ? 'MATCH' : 'NO MATCH'}`);
    row('Test-USDC balance / limit', `${amount(d.usdcBalanceRaw ?? 0)} / ${amount(d.usdcLimitRaw ?? 0)}`);
    row('Shared tree / still to fund', `${amount(d.totalUsdcBalanceRaw ?? 0)} / ${amount(d.fundingShortfallRaw ?? 0)} Test-USDC`);
    row('Missing requirements', Array.isArray(d.missing) ? d.missing.join(' · ') || 'None' : 'Unknown');
    row('Write readiness', d.writeReady ? 'Setup checks passed; action simulation and fee check required' : 'BLOCKED');
    row('MCP writes', d.writesEnabled ? 'Explicitly enabled; onchain policy still enforced' : 'Disabled');
    for (const action of d.walletActions ?? []) row('Wallet action', `${action.action}: ${action.recipient ?? action.newOperator ?? action.vault} ${action.amountWei ? `${action.amountWei} wei` : action.amountRaw ? `${action.amountRaw} raw USDC` : ''}`);
    row('Snapshot block', d.source?.blockNumber); row('Observed', d.source?.observedAt);
    row('Inference', 'This chat. No Docker, model key or background AI worker.');
    view.next = 'Owner authorizes the agent key in the normal wallet browser. USDC approval is not an ETH gas transfer. Do not repeat completed funding or rebind a correct operator.';
  } else if (name === 'prepareRootSetup') {
    view.status = d.browser?.opened ? 'AWAITING WALLET' : 'OPEN WALLET IN BROWSER';
    row('ENS name', d.ensName); row('Demo budget', `${d.budgetUSDC} Test-USDC`);
    row('Browser', d.browser?.opened ? 'Launch requested in your normal browser profile' : 'Open the setup link below in your wallet-enabled browser');
    row('Wallet steps', 'Create root → select root in capital MCP → prepare local signer → authorize → fund only shortfall → check native gas');
    row('Signing', 'Owner reviews and signs each setup transaction in their wallet.');
    view.next = 'No transaction submitted by this MCP. Return to the capital-mode chat after root creation. Select its ENS explicitly before preparing local signer authorization.';
  } else {
    if (d.status === 'blocked' || d.status === 'unavailable') {
      view.status = 'NOT EXECUTED'; row('Details', d.next); row('Transaction submitted', d.transactionSubmitted);
      view.next = d.next ?? view.next;
    }
    if (d.status === 'confirmed') view.status = 'TRANSACTION CONFIRMED';
    if (d.dispatchStatus === 'started') view.status = 'ALLOCATION CONFIRMED · WORKER STARTED';
    if (d.dispatchStatus === 'not_requested') {
      view.status = 'VAULT CONFIRMED · CHAT-MANAGED';
      view.next = 'Capital is allocated onchain. No autonomous AI worker was requested. Show getTree next.';
    }
    if (d.dispatchStatus === 'allocation_confirmed_dispatch_unknown') view.status = 'ALLOCATION CONFIRMED · WORKER UNKNOWN';
    if (d.recordedOnchain === false) view.status = 'NO ALLOCATION RECORDED';
    row('Node', args.nodeId ?? args.childId ?? d.childId); row('Target / active MCP root', d.targetRootId ?? args.expectedRootId ?? args.rootId ?? d.rootId);
    row('Transaction', d.transactionHash ?? d.txHash); row('Receipt block', d.blockNumber);
    row('Worker dispatch', d.dispatchStatus);
    if (name === 'getEffectivePolicy') {
      const policy = d;
      if (scalar(policy.capabilities) && /^\d+$/.test(String(policy.capabilities))) row('Policy capabilities', rights.filter((_,i)=>(BigInt(policy.capabilities)&(1n<<BigInt(40+i*4)))!==0n).join(' · ') || 'None');
      row('Token mask', policy.tokenMask);
      row('Expiry (Unix)', policy.expiry);
      if (Array.isArray(policy.maxAmounts)) row('Per-action limits (raw)', policy.maxAmounts.join(' / '));
      view.next = 'Policy is a limit, not proof of current authority. getTree checks actual authorized actions.';
    }
    if (name === 'getCapitalActivity') {
      row('Entries in this page', Array.isArray(d.items) ? d.items.length : undefined);
      row('Indexer', d.indexing?.state); row('Indexed through block', d.indexing?.latestIndexedBlock);
      row('RPC verification block', d.verification?.checkedAtBlock);
      view.next = 'Indexed activity can lag. Only verified receipts prove transactions; use getTree for current state.';
    }
    if (name === 'getPaymentServices') {
      row('Configured services', Array.isArray(d.services) ? d.services.length : 0);
      for (const service of (d.services ?? []).slice(0, 5)) row('Service', service.id);
    }
    if (name === 'purchaseService') { row('Service', d.serviceId); if (/^\d+$/.test(String(d.amount))) row('Paid', `${amount(d.amount)} Test-USDC`); }
    if (!view.rows.length) row('Result', 'Response received. Full structured data accompanies this card.');
  }
  return view;
}

export function toolAsSvg(view) {
  const accent = view.error ? t.destructive : t.primary;
  let body = rect(32, 171, 976, 52, t.soft, accent);
  body += `<circle cx="55" cy="197" r="4" fill="${accent}"/>`;
  body += text(70,203,view.status,{size:14,color:accent,weight:800});
  let y = 245;
  for (const [label,value] of view.rows) {
    const wrapped = lines(value, 78), height = Math.max(64, 24+wrapped.length*22);
    body += rect(32,y,976,height);
    body += text(52,y+30,label,{size:13,color:t.mutedForeground});
    wrapped.forEach((line,i)=>{body+=text(248,y+30+i*22,line,{size:15,mono:label==='Transaction'||label.includes('block')});});
    y += height+10;
  }
  const nextLines = lines(view.next, 106), nextHeight = 42+nextLines.length*21;
  body += rect(32,y+8,976,nextHeight,t.accent,t.border);
  body += text(52,y+34,'NEXT STEP',{size:11,mono:true,color:t.primary});
  nextLines.forEach((line,i)=>{body+=text(52,y+59+i*21,line,{size:14});});
  return frame(y+nextHeight+70,view.title,`MCP / ${view.tool} · Ethereum Sepolia`,body,`Response received ${view.receivedAt} · See JSON for complete data and provenance.`);
}

const safeMermaid = value => String(value).replace(/[^a-zA-Z0-9 .,():/_-]/g,'').slice(0,180);
export function toolAsMermaid(view) {
  return `flowchart TD\n  request["${safeMermaid(view.title)}"] --> status["${safeMermaid(view.status)}"]\n  status --> next["${safeMermaid(view.next)}"]\n  style status fill:${t.card},stroke:${view.error?t.destructive:t.ring},color:${t.foreground}`;
}

export async function visualResult(name, args, data, options = {}) {
  const content = [{ type:'text', text:typeof data==='string' && options.isError ? data : JSON.stringify(data,(_,v)=>typeof v==='bigint'?v.toString():v) }];
  let fallback, images = [];
  const view = toolView(name,args,data,options);
  try {
    if (!options.isError && (name==='getTree'||name==='visualizeTree')) {
      fallback = treeAsMermaid(data);
      for (let page=0;page<Math.ceil(data.nodes.length/NODES_PER_PAGE);page++) images.push(await treeAsPng(data,page));
    } else { fallback=toolAsMermaid(view); images=[await svgAsPng(toolAsSvg(view))]; }
  } catch {
    // Rendering must never turn an executed write into an apparent failure/retry.
    view.rows.push(['Graphic detail', 'Detailed view unavailable; original tool data is preserved.']);
    fallback=toolAsMermaid(view); images=[await svgAsPng(toolAsSvg(view))];
  }
  const links=[];
  for(let index=0;index<images.length;index++) {
    try {links.push(await imageLink(images[index],`${view.title}${images.length>1?` (${index+1}/${images.length})`:''}`));}
    catch { /* The in-band PNG remains usable if the host cannot write its cache. */ }
  }
  content.push({ type:'text', text:`${resultMarkdown(name, args, data, options)}\n\nShow the dashboard graphic in your final answer. Copy these Markdown links verbatim; the PNG files already exist:\n${links.join('\n')}\nIf local images are unsupported, display this Mermaid fallback:\n\x60\x60\x60mermaid\n${fallback}\n\x60\x60\x60` });
  for (const png of images) content.push({type:'image',data:png.toString('base64'),mimeType:'image/png',annotations:{audience:['user','assistant'],priority:1}});
  return { ...(options.isError?{isError:true}:{}), structuredContent: JSON.parse(JSON.stringify(data && typeof data === 'object' ? data : { message: data }, (_,v)=>typeof v==='bigint'?v.toString():v)), content };
}
