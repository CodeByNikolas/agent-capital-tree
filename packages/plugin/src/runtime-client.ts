import { toolSpecs, type ToolName } from './tools.js';

export class RuntimeError extends Error {}

/** Client bearer is scoped by the companion to the real worker/root context. */
export class RuntimeClient {
  constructor(private readonly endpoint?: string, private readonly bearer?: string,
    private readonly request: typeof fetch = fetch) {}

  async call(name: ToolName, rawArgs: unknown): Promise<unknown> {
    const args = toolSpecs[name].schema.parse(rawArgs);
    if (!this.endpoint || !this.bearer) throw new RuntimeError('Local Agent Capital Tree runtime is not configured. Set ACT_RUNTIME_URL and ACT_MCP_TOKEN through trusted local setup.');
    let url: URL;
    try { url = new URL(this.endpoint); }
    catch { throw new RuntimeError('Invalid ACT_RUNTIME_URL.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new RuntimeError('ACT_RUNTIME_URL must be an HTTP(S) origin without credentials or a path.');
    }
    let response: Response;
    try {
      response = await this.request(new URL(`/v1/tools/${name}`, url), {
        method: 'POST',
        headers: { authorization: `Bearer ${this.bearer}`, 'content-type': 'application/json' },
        body: JSON.stringify(args), redirect: 'error', signal: AbortSignal.timeout(30_000)
      });
    } catch { throw new RuntimeError('Local runtime is unavailable. No operation was confirmed. Reconcile status before retrying a write.'); }
    if (!response.ok) throw new RuntimeError(`Local runtime rejected ${name} (HTTP ${response.status}). No success was reported; reconcile status before retrying a write.`);
    try { return await response.json() as unknown; }
    catch { throw new RuntimeError('Local runtime returned an invalid response. No success was reported.'); }
  }
}
