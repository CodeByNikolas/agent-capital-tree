import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RuntimeClient, RuntimeError } from './runtime-client.js';
import { toolSpecs, type ToolName } from './tools.js';
// @ts-ignore The shared SVG/PNG renderer is an ESM JavaScript module bundled by esbuild.
import { visualServer } from '../visual-server.mjs';

const client = new RuntimeClient(process.env.ACT_RUNTIME_URL, process.env.ACT_MCP_TOKEN);
const server = await visualServer({ name: 'kanoki', specs: toolSpecs,
  execute: (name: ToolName, args: unknown) => client.call(name, args),
  describeError: (error: unknown) => error instanceof RuntimeError ? error.message : 'Local runtime request failed. Reconcile before retrying a write.'
});

await server.connect(new StdioServerTransport());
