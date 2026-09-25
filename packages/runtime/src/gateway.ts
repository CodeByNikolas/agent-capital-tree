import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { chmod, lstat, realpath, rm, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { createConnection } from 'node:net';

export type GatewayConfig = Readonly<{
  socket: string;
  workerRoot: string;
  uid: number;
  brokerOrigin: string;
  brokerToken: string;
  companionOrigin: string;
  mcpToken: string;
}>;

/** Private Unix transport. Worker headers cannot select another worker's grant or context. */
export async function startWorkerGateway(config: GatewayConfig) {
  const root = await realpath(config.workerRoot);
  const socket = resolve(config.socket);
  if (!socket.startsWith(root + sep) || dirname(socket) !== root) throw new Error('gateway socket outside worker root');
  const rootInfo = await stat(root);
  if (rootInfo.uid !== config.uid || (rootInfo.mode & 0o777) !== 0o700) throw new Error('invalid gateway directory');
  for (const value of [config.brokerOrigin, config.companionOrigin]) {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('gateway target must be a loopback HTTP origin');
    }
  }
  if (!config.brokerToken || !config.mcpToken) throw new Error('missing scoped gateway credentials');
  try {
    const existing = await lstat(socket);
    if (!existing.isSocket() || existing.uid !== config.uid || (existing.mode & 0o777) !== 0o600) throw new Error('invalid existing gateway socket');
    const stale = await new Promise<boolean>((resolve, reject) => {
      const client = createConnection(socket);
      client.setTimeout(500);
      client.once('connect', () => { client.destroy(); resolve(false); });
      client.once('error', error => {
        client.destroy();
        if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') resolve(true);
        else reject(error);
      });
      client.once('timeout', () => { client.destroy(); resolve(false); });
    });
    if (!stale) throw new Error('gateway socket already active');
    await rm(socket);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, (req, res) => { void forward(req, res, config); });
  try {
    await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(socket, ok); });
    await chmod(socket, 0o600);
    return {
      socket,
      close: async () => {
        await new Promise<void>((ok, fail) => server.close(error => error ? fail(error) : ok()));
        await rm(socket, { force: true });
      }
    };
  } catch (error) {
    server.close();
    await rm(socket, { force: true });
    throw error;
  }
}

async function forward(req: IncomingMessage, res: ServerResponse, config: GatewayConfig): Promise<void> {
  const deny = (status: number) => { res.writeHead(status); res.end(); };
  if (req.method !== 'POST' || req.headers.origin || req.url?.includes('?')) return deny(404);
  const inference = req.url === '/v1/responses';
  const tool = /^\/v1\/tools\/[A-Za-z]+$/.test(req.url ?? '');
  if (!inference && !tool) return deny(404);
  let size = 0;
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > (inference ? 1_000_000 : 32_768)) return deny(413);
      chunks.push(chunk as Buffer);
    }
    const upstream = await fetch(new URL(req.url!, inference ? config.brokerOrigin : config.companionOrigin), {
      method: 'POST',
      headers: { authorization: `Bearer ${inference ? config.brokerToken : config.mcpToken}`, 'content-type': 'application/json' },
      body: Buffer.concat(chunks), redirect: 'error', signal: AbortSignal.timeout(300_000)
    });
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
    if (upstream.body) for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch { if (!res.headersSent) deny(502); else res.destroy(); }
}
