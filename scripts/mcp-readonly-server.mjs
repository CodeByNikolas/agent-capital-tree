#!/usr/bin/env node
// Keyless local MCP: public reads and browser-wallet handoff, never a signer.
import { readFile } from 'node:fs/promises';
import { StdioServerTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';
import { capitalClient } from '../packages/sdk/dist/index.js';
import { toolSpecs } from '../packages/plugin/dist/tools.js';
import { visualServer } from '../packages/plugin/visual-server.mjs';
import { z } from '../packages/plugin/node_modules/zod/index.js';
import { openWalletBrowser } from './open-wallet-browser.mjs';

const manifest = JSON.parse(await readFile(new URL('../deployments/usdc-sepolia.json', import.meta.url), 'utf8'));
const chain = capitalClient(process.env.ACT_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia.publicnode.com', manifest.contracts.CapitalController.address);
const specs = {
  getTree:toolSpecs.getTree,
  visualizeTree:{...toolSpecs.getTree,description:'Alias of getTree: return live data, dashboard-style PNG pages and Mermaid from one Sepolia snapshot. Accept root ID, full ENS name or vault address.'},
  prepareRootSetup:{
    description:'Prepare a new Sepolia demo vault with at most 0.10 Test-USDC and OPEN its setup link directly in the user’s normal system browser, where their existing wallet extension is installed. Do not open a separate chat/automation browser. The user reviews and signs in the browser wallet. Never signs or sends a transaction itself. Set openBrowser:false only to prepare a link without opening it.',
    schema:z.object({label:z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
      budgetRaw:z.string().max(6).regex(/^[1-9]\d*$/).refine(value=>BigInt(value)<=100_000n,'Maximum 0.10 Test-USDC'),
      openBrowser:z.boolean().default(true)}).strict(),readOnly:false
  }
};

async function execute(name,args) {
  if (name==='prepareRootSetup') {
    const {label,budgetRaw}=args, url=new URL('https://agent-capital-tree-silk.vercel.app/setup');
    url.searchParams.set('action','create-root');url.searchParams.set('label',label);url.searchParams.set('budget',budgetRaw);
    const browser=args.openBrowser?await openWalletBrowser(url.href):{opened:false,method:'not-requested',walletDetected:false};
    return {network:'Ethereum Sepolia',chainId:11155111,ensName:`${label}.agentcapitalusdc.eth`,budgetRaw,
      budgetUSDC:(Number(budgetRaw)/1_000_000).toString(),url:url.href,browser,
      next:'Use your normal browser profile with the wallet extension. Review and sign root creation, exact Test-USDC approval/funding, then bind the local root operator. Return to chat afterwards. No owner key enters this chat.'};
  }
  for(let attempt=0;attempt<3;attempt++) {
    try {
      const resolved=await chain.resolveTree(args.query??args.rootId);
      if(resolved.tree.source.chainId!==11155111) throw new Error('Unexpected chain ID');
      return {...resolved.tree,selectedNodeId:resolved.selectedNodeId};
    } catch(error) {
      if(!/\b429\b|Too Many Requests/i.test(String(error))||attempt===2) throw error;
      await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)));
    }
  }
}

const server=await visualServer({name:'agent-capital-tree-readonly',specs,execute,
  instructions:'Public Sepolia Test-USDC reads and local system-browser wallet setup. No financial signer. prepareRootSetup already opens the normal browser; do not use a chat-browser tool to open it again. Only the user can confirm wallet connection and sign. Never claim the dashboard observes this local MCP session.',
  describeError(error) {
    const message=String(error);
    if(/\b429\b|Too Many Requests/i.test(message)) return 'Public Sepolia RPC rate-limited this read. Wait briefly or configure another Sepolia endpoint outside the chat.';
    if(/chain ID|chain mismatch/i.test(message)) return 'Unexpected chain. Only Ethereum Sepolia (11155111) is supported.';
    if(/not found|no matching|unknown root|does not exist|not a root|invalid.*query|expected.*root/i.test(message)) return 'No matching root or vault found. Check the ENS name, vault address or root ID.';
    return 'Sepolia read unavailable. Check the vault identifier and RPC connection. No transaction was submitted.';
  }
});
await server.connect(new StdioServerTransport());
