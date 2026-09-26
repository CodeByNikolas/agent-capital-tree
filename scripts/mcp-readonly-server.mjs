#!/usr/bin/env node
// Keyless local MCP: public reads and browser-wallet handoff, never a signer.
import { readFile } from 'node:fs/promises';
import { StdioServerTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';
import { capitalClient } from '../packages/sdk/dist/index.js';
import { toolSpecs } from '../packages/plugin/dist/tools.js';
import { visualServer } from '../packages/plugin/visual-server.mjs';
import { rootSetupSpec, prepareRootSetup } from './root-wallet-setup.mjs';

const manifest = JSON.parse(await readFile(new URL('../deployments/usdc-sepolia.json', import.meta.url), 'utf8'));
const chain = capitalClient(process.env.ACT_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia.publicnode.com', manifest.contracts.CapitalController.address);
const specs = {
  getTree:toolSpecs.getTree,
  visualizeTree:{...toolSpecs.getTree,description:'Alias of getTree: return live data, dashboard-style PNG pages and Mermaid from one Sepolia snapshot. Accept root ID, full ENS name or vault address.'},
  prepareRootSetup:rootSetupSpec
};

async function execute(name,args) {
  if (name==='prepareRootSetup') return prepareRootSetup(args);
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
