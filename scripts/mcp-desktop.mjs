#!/usr/bin/env node
// Optional foreground health window. Codex and Claude start separate STDIO sessions.
import { fileURLToPath } from 'node:url';
import { Client } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const client = new Client({ name: 'capital-tree-desktop-monitor', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./mcp-readonly-server.mjs', import.meta.url))],
  env: process.env
});
let timer;
let closing = false;

async function close(code = 0) {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  await client.close().catch(() => {});
  process.exitCode = code;
}

try {
  await client.connect(transport);
  const tools = await client.listTools();
  if (tools.tools.map(tool => tool.name).sort().join(',') !== 'getTree,prepareRootSetup,visualizeTree') {
    throw new Error('Unexpected MCP tool list');
  }
  const result = await client.callTool({ name: 'getTree', arguments: { rootId: '1' } });
  if (result.isError) throw new Error(result.content?.[0]?.text ?? 'getTree failed');
  const tree = result.structuredContent;
  console.log(`CONNECTED · local MCP process · Sepolia ${tree.source.chainId} · root ${tree.rootId} · ${tree.nodes.length} agents · block ${tree.source.blockNumber}`);
  console.log('This foreground monitor keeps its own read-only MCP session open. Codex/Claude launch separate sessions from their settings. Press Ctrl+C to stop.');
  timer = setInterval(async () => {
    try {
      await client.listTools();
      console.log(`CONNECTED · MCP process responding · ${new Date().toISOString()}`);
    } catch (error) {
      console.error(`DISCONNECTED · ${error instanceof Error ? error.message : String(error)}`);
      await close(1);
    }
  }, 60_000);
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
} catch (error) {
  console.error(`DISCONNECTED · ${error instanceof Error ? error.message : String(error)}`);
  await close(1);
}
