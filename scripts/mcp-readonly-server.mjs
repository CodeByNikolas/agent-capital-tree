#!/usr/bin/env node
// Keyless, read-only MCP for local Codex chats. No runtime token, signer or write handler.
import { readFile } from 'node:fs/promises';
import { McpServer } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js';
import { StdioServerTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';
import { capitalClient } from '../packages/sdk/dist/index.js';
import { toolSpecs } from '../packages/plugin/dist/tools.js';
import { treeAsMermaid, treeAsPng } from '../packages/plugin/tree-visual.mjs';

const manifest = JSON.parse(await readFile(new URL('../deployments/usdc-sepolia.json', import.meta.url), 'utf8'));
const rpcUrl = process.env.ACT_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia.publicnode.com';
const chain = capitalClient(rpcUrl, manifest.contracts.CapitalController.address);
const server = new McpServer({
  name: 'agent-capital-tree-readonly',
  version: '0.1.0',
  instructions: 'Read-only Ethereum Sepolia Test-USDC capital-tree inspection. getTree returns data; visualizeTree returns a rendered image and Mermaid fallback. Report source.blockNumber and observedAt with every answer. Never claim that this server can execute financial actions or that the dashboard can see this local MCP session.'
});

async function readTree(rootId) {
  if (!/^[1-9]\d*$/.test(rootId)) throw new Error('rootId must be a positive decimal integer');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tree = await chain.getTree(BigInt(rootId));
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

server.registerTool('getTree', {
  description: toolSpecs.getTree.description,
  inputSchema: toolSpecs.getTree.schema,
  annotations: { readOnlyHint: true, destructiveHint: false }
}, async ({ rootId }) => {
  try {
    const tree = await readTree(rootId);
    return { content: [{ type: 'text', text: JSON.stringify(tree, (_, value) => typeof value === 'bigint' ? value.toString() : value) }] };
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('visualizeTree', {
  description: 'Render a live Agent Capital Tree as a labeled PNG diagram for the chat, with Mermaid text fallback. Read-only Sepolia snapshot; no wallet or transaction. Show the image to the user and include the source block and observed time.',
  inputSchema: toolSpecs.getTree.schema,
  annotations: { readOnlyHint: true, destructiveHint: false }
}, async ({ rootId }) => {
  try {
    const tree = await readTree(rootId);
    const image = await treeAsPng(tree);
    return { content: [
      { type: 'text', text: `Root ${tree.rootId} · Sepolia ${tree.source.chainId} · block ${tree.source.blockNumber} · observed ${tree.source.observedAt}\n\nMermaid fallback:\n\x60\x60\x60mermaid\n${treeAsMermaid(tree)}\n\x60\x60\x60` },
      { type: 'image', data: image.toString('base64'), mimeType: 'image/png' }
    ] };
  } catch (error) {
    return errorResult(error);
  }
});

await server.connect(new StdioServerTransport());
