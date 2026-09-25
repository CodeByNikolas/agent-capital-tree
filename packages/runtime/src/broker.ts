import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export type BrokerConfig = Readonly<{ upstream: string; upstreamKey: string; maxBodyBytes: number }>;
type Grant = { expiresAt: number; remaining: number; model: string };

/** Companion-only key stays in memory. Tokens carry one fixed model, deadline and call budget. */
export class InferenceBroker {
  #grants = new Map<string, Grant>();
  constructor(private config: BrokerConfig) {
    const url = new URL(config.upstream);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('invalid upstream');
    if (!url.pathname.endsWith('/v1')) throw new Error('upstream must end in /v1');
    if (!config.upstreamKey || !Number.isSafeInteger(config.maxBodyBytes) || config.maxBodyBytes < 1) throw new Error('invalid broker config');
  }
  issue(model: string, ttlMs: number, calls: number): string {
    if (!/^[\w.-]+$/.test(model) || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 86_400_000 ||
      !Number.isSafeInteger(calls) || calls < 1 || calls > 1000) throw new Error('invalid grant');
    const token = randomBytes(32).toString('base64url');
    this.#grants.set(createHash('sha256').update(token).digest('hex'), { model, expiresAt: Date.now() + ttlMs, remaining: calls });
    return token;
  }
  revoke(token: string): void { this.#grants.delete(createHash('sha256').update(token).digest('hex')); }
  server() { return createServer((req, res) => { void this.#handle(req, res); }); }
  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const deny = (status: number) => { res.writeHead(status); res.end(); };
    if (req.method !== 'POST' || req.url !== '/v1/responses') return deny(404);
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')?.[1];
    const tokenHash = token && createHash('sha256').update(token).digest('hex');
    const grant = tokenHash && this.#grants.get(tokenHash);
    if (!grant || grant.expiresAt <= Date.now() || grant.remaining <= 0) return deny(401);
    // Reserve before any await, preventing concurrent calls from exceeding the grant.
    grant.remaining--;
    let size = 0;
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > this.config.maxBodyBytes) return deny(413);
        chunks.push(chunk as Buffer);
      }
      if (this.#grants.get(tokenHash) !== grant || grant.expiresAt <= Date.now()) return deny(401);
      let body: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return deny(400);
        body = parsed as Record<string, unknown>;
      } catch { return deny(400); }
      if (body.model !== grant.model) return deny(403);
      const upstream = await fetch(`${this.config.upstream}/responses`, {
        method: 'POST', headers: { authorization: `Bearer ${this.config.upstreamKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body), redirect: 'error',
        signal: AbortSignal.timeout(Math.min(300_000, Math.max(1, grant.expiresAt - Date.now())))
      });
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
      if (upstream.body) for await (const chunk of upstream.body) res.write(chunk);
      res.end();
    } catch { if (!res.headersSent) deny(502); else res.destroy(); }
  }
}
