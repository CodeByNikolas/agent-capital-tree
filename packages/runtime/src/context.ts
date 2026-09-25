import { createHash, randomBytes } from 'node:crypto';

export type WorkerContext = Readonly<{
  workerId: string;
  rootId: string;
  nodeId: string;
  authorityGeneration: string;
}>;

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The transport authenticates first; model-provided IDs are never consulted. */
export class WorkerSessions {
  #sessions = new Map<string, { context: WorkerContext; expiresAt: number }>();

  issue(context: WorkerContext, expiresAt: number): string {
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('invalid expiry');
    const token = randomBytes(32).toString('base64url');
    this.#sessions.set(digest(token), { context: Object.freeze({ ...context }), expiresAt });
    return token;
  }

  authenticate(header: string | undefined): WorkerContext {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '');
    const session = match && this.#sessions.get(digest(match[1]!));
    if (!session || session.expiresAt <= Date.now()) throw new Error('unauthorized worker');
    return session.context;
  }

  revoke(token: string): void { this.#sessions.delete(digest(token)); }
}

/** MCP transport adapter: pass only the authenticated context to write handlers. */
export function authorizedWorkerCall<T>(
  sessions: WorkerSessions,
  authorization: string | undefined,
  handler: (context: WorkerContext) => Promise<T>
): Promise<T> {
  return handler(sessions.authenticate(authorization));
}
