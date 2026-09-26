#!/usr/bin/env node
// Keyless, read-only MCP for local Codex chats. No runtime token, signer or write handler.
import { readFile } from 'node:fs/promises';
import { McpServer } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js';
import { StdioServerTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';
import { capitalClient } from '../packages/sdk/dist/index.js';
import { toolSpecs } from '../packages/plugin/dist/tools.js';

const manifest = JSON.parse(await readFile(new URL('../deployments/usdc-sepolia.json', import.meta.url), 'utf8'));
const rpcUrl = process.env.ACT_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia.publicnode.com';
const chain = capitalClient(rpcUrl, manifest.contracts.CapitalController.address);
const server = new McpServer({
  name: 'agent-capital-tree-readonly',
  version: '0.1.0',
  instructions: 'Read-only Ethereum Sepolia Test-USDC capital-tree inspection. Only getTree is available. Report source.blockNumber and observedAt with every answer. Never claim that this server can execute financial actions or that the dashboard can see this local MCP session.'
});

server.registerTool('getTree', {
  description: toolSpecs.getTree.description,
  inputSchema: toolSpecs.getTree.schema,
  annotations: { readOnlyHint: true, destructiveHint: false }
}, async ({ rootId }) => {
  try {
    if (!/^[1-9]\d*$/.test(rootId)) throw new Error('rootId must be a positive decimal integer');
    const tree = await chain.getTree(BigInt(rootId));
    if (tree.source.chainId !== manifest.chainId) throw new Error('Unexpected chain ID');
    return { content: [{ type: 'text', text: JSON.stringify(tree, (_, value) => typeof value === 'bigint' ? value.toString() : value) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Sepolia read failed' }] };
  }
});

await server.connect(new StdioServerTransport());
