import { createServer } from 'node:http';
import { toolSpecs, type ToolName } from '@agent-capital-tree/plugin/tools';
import { WorkerSessions, type WorkerContext } from './context.js';

export type ToolHandler = (context: WorkerContext, args: Record<string, unknown>) => Promise<unknown>;

/** Local authenticated transport; missing integrations fail explicitly, with no fake success. */
export function companionServer(sessions: WorkerSessions, handlers: Partial<Record<ToolName, ToolHandler>>) {
  return createServer({ requestTimeout: 15000, headersTimeout: 10000 }, async (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body, (_key, value) => typeof value === 'bigint' ? value.toString() : value));
    };
    // Browser pages never need access to this signer transport. Wallet UI talks directly to chain.
    if (req.headers.origin) return reply(403, { error: 'Browser origins are not allowed' });
    const name = /^\/v1\/tools\/([A-Za-z]+)$/.exec(req.url ?? '')?.[1];
    if (req.method !== 'POST' || !name || !Object.hasOwn(toolSpecs, name)) return reply(404, { error: 'Unknown tool' });
    let context: WorkerContext;
    try { context = sessions.authenticate(req.headers.authorization); }
    catch { return reply(401, { error: 'Unauthorized worker' }); }
    const key = name as ToolName;
    const handler = handlers[key];
    if (!handler) return reply(501, { error: 'Tool integration is unavailable' });
    let size = 0;
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > 32768) return reply(413, { error: 'Request too large' });
        chunks.push(chunk as Buffer);
      }
    } catch { return reply(400, { error: 'Incomplete request' }); }
    let args: Record<string, unknown>;
    try { args = toolSpecs[key].schema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch { return reply(400, { error: 'Invalid tool arguments' }); }
    // A slow request may have outlived or lost its session while its body was arriving.
    try { context = sessions.authenticate(req.headers.authorization); }
    catch { return reply(401, { error: 'Unauthorized worker' }); }
    try { return reply(200, await handler(context, args)); }
    catch {
      // Contract/provider errors can embed private RPC URLs or signing parameters.
      return reply(409, { error: 'Operation was not confirmed; reconcile before retrying' });
    }
  });
}
