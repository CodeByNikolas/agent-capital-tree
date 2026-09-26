import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RuntimeClient } from './runtime-client.js';
import { toolSpecs, type ToolName } from './tools.js';
// @ts-ignore The shared SVG/PNG renderer is an ESM JavaScript module bundled by esbuild.
import { treeAsMermaid, treeAsPng, treeAsSvg } from '../tree-visual.mjs';

const client = new RuntimeClient(process.env.ACT_RUNTIME_URL, process.env.ACT_MCP_TOKEN);
const server = new McpServer({ name: 'agent-capital-tree', version: '0.1.0' });

for (const [name, spec] of Object.entries(toolSpecs)) {
  server.registerTool(name, {
    description: spec.description,
    inputSchema: spec.schema,
    annotations: { readOnlyHint: spec.readOnly, destructiveHint: !spec.readOnly }
  }, async (args: unknown) => {
    try {
      const data = await client.call(name as ToolName, args);
      if (name === 'getTree') {
        const tree = data as { source: { blockNumber: string; observedAt: string }; selectedNodeId: string };
        let image: Buffer;
        let mimeType: 'image/png' | 'image/svg+xml' = 'image/png';
        try { image = await treeAsPng(tree); }
        catch { image = Buffer.from(treeAsSvg(tree)); mimeType = 'image/svg+xml'; }
        return { content: [
          { type: 'text' as const, text: JSON.stringify(data) },
          { type: 'text' as const, text: `Mermaid fallback:\n\x60\x60\x60mermaid\n${treeAsMermaid(tree)}\n\x60\x60\x60` },
          { type: 'image' as const, data: image.toString('base64'), mimeType }
        ] };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Local runtime request failed.';
      return { isError: true, content: [{ type: 'text' as const, text: message }] };
    }
  });
}

await server.connect(new StdioServerTransport());
