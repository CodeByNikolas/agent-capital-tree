#!/usr/bin/env node
// Print settings for the checkout that actually contains this script, never the shell's cwd.
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./mcp-readonly-server.mjs', import.meta.url));
const required = [
  new URL('../packages/sdk/dist/index.js', import.meta.url),
  new URL('../packages/plugin/dist/tools.js', import.meta.url),
  new URL('../packages/plugin/node_modules/@resvg/resvg-wasm', import.meta.url),
  new URL('../packages/plugin/visual-assets/Manrope.ttf', import.meta.url)
];
for (const file of required) {
  try { await access(file); }
  catch { throw new Error(`Missing ${fileURLToPath(file)}. Run pnpm install --frozen-lockfile --ignore-scripts, then build SDK and plugin.`); }
}

console.log(`Command: ${process.execPath}`);
console.log(`Argument: ${script}`);
console.log('Codex desktop: Settings > MCP servers > Add server > STDIO. Enter the command and one argument above, Save, Restart.');
console.log('Claude Desktop: use Desktop app > Developer settings to edit the local MCP configuration; merge this entry into mcpServers and fully restart Claude Desktop:');
console.log(JSON.stringify({ kanoki: { command: process.execPath, args: [script] } }, null, 2));
console.log('Do not replace existing MCP servers. In Claude Code, use `claude mcp add --scope user kanoki -- <command> <argument>` instead.');
console.log('These hosts start the STDIO process while connected; `pnpm mcp:desktop` opens an optional, separate foreground status session.');
