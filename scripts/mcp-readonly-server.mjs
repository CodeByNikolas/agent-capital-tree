#!/usr/bin/env node
// Keyless, read-only MCP for local Codex chats. No runtime token, signer or write handler.
import { readFile } from 'node:fs/promises';
import { McpServer } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js';
import { StdioServerTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';
import { capitalClient } from '../packages/sdk/dist/index.js';
import { toolSpecs } from '../packages/plugin/dist/tools.js';
import { treeAsMermaid, treeAsPng } from '../packages/plugin/tree-visual.mjs';
import { z } from '../packages/plugin/node_modules/zod/index.js';

const manifest = JSON.parse(await readFile(new URL('../deployments/usdc-sepolia.json', import.meta.url), 'utf8'));
const rpcUrl = process.env.ACT_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia.publicnode.com';
const chain = capitalClient(rpcUrl, manifest.contracts.CapitalController.address);
const server = new McpServer({
  name: 'agent-capital-tree-readonly',
  version: '0.1.0',
  instructions: 'Read-only Ethereum Sepolia Test-USDC capital-tree inspection. getTree returns data; visualizeTree returns a rendered image and Mermaid fallback. Report source.blockNumber and observedAt with every answer. Never claim that this server can execute financial actions or that the dashboard can see this local MCP session.'
});

async function readTree(query) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resolved = await chain.resolveTree(query);
      const tree = { ...resolved.tree, selectedNodeId: resolved.selectedNodeId };
      if (tree.source.chainId !== manifest.chainId) throw new Error('Unexpected chain ID');
      return tree;
    } catch (error) {
      if (!/\b429\b|Too Many Requests/i.test(String(error)) || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
}

function errorResult(error) {
  const message = /\b429\b|Too Many Requests/i.test(String(error))
    ? 'Public Sepolia RPC rate-limited the read. Wait briefly or set ACT_SEPOLIA_RPC_URL to your own Sepolia RPC endpoint.'
    : error instanceof Error ? error.message : 'Sepolia read failed';
  return { isError: true, content: [{ type: 'text', text: message }] };
}

async function treeResult(args) {
  try {
    const tree = await readTree(args.query ?? args.rootId);
    const png = await treeAsPng(tree);
    return { content: [
      { type: 'text', text: JSON.stringify(tree, (_, value) => typeof value === 'bigint' ? value.toString() : value) },
      { type: 'text', text: `Mermaid fallback:\n\x60\x60\x60mermaid\n${treeAsMermaid(tree)}\n\x60\x60\x60` },
      { type: 'image', data: png.toString('base64'), mimeType: 'image/png' }
    ] };
  } catch (error) { return errorResult(error); }
}

server.registerTool('getTree', {
  description: toolSpecs.getTree.description,
  inputSchema: toolSpecs.getTree.schema,
  annotations: { readOnlyHint: true, destructiveHint: false }
}, treeResult);

server.registerTool('visualizeTree', {
  description: 'Alias of getTree: return both live JSON data and a PNG tree graph from one Sepolia snapshot, plus Mermaid fallback. Accept numeric root ID, full ENS name or vault address. Show the image in the chat.',
  inputSchema: toolSpecs.getTree.schema,
  annotations: { readOnlyHint: true, destructiveHint: false }
}, treeResult);

server.registerTool('prepareRootSetup', {
  description: 'Start a new Sepolia root-vault demo from the chat. Returns a direct browser-wallet setup link with a reviewed label and at most 0.10 Test-USDC; this tool never signs or sends a transaction. After wallet creation, use getTree by ENS name, then bind the local operator before asking the agent to create children.',
  inputSchema: z.object({
    label: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
    budgetRaw: z.string().max(6).regex(/^[1-9]\d*$/).refine(value => BigInt(value) <= 100_000n, 'Maximum 0.10 Test-USDC')
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false }
}, async ({ label, budgetRaw }) => {
  const url = new URL('https://agent-capital-tree-silk.vercel.app/setup');
  url.searchParams.set('action', 'create-root');
  url.searchParams.set('label', label);
  url.searchParams.set('budget', budgetRaw);
  return { content: [{ type: 'text', text: JSON.stringify({
    network: 'Ethereum Sepolia', chainId: 11155111, ensName: `${label}.agentcapitalusdc.eth`,
    budgetRaw, budgetUSDC: (Number(budgetRaw) / 1_000_000).toString(), url: url.toString(),
    next: 'Open the URL in a browser with your wallet. Review and sign root creation, exact Test-USDC approval/funding, then bind the local root operator. Each is a separate wallet transaction. No owner key enters this chat.'
  }) }] };
});

await server.connect(new StdioServerTransport());
