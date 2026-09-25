# Agent Capital Tree Codex plugin

This local Codex plugin exposes read and write MCP tools through the user's own companion runtime. It does not hold a wallet key or provider credential. The portable `plugin.json`/`mcp.json` pair and compatibility `.codex-plugin/plugin.json`/`.mcp.json` pair point at the same bundled stdio server. There are no hooks.

The plugin sends `POST /v1/tools/<toolName>` with a JSON body and `Authorization: Bearer <ACT_MCP_TOKEN>` to `ACT_RUNTIME_URL`. The companion must bind that token to the actual root/worker context, check current on-chain authority, and perform or reject the requested operation. A model-supplied `agentId` is rejected by the strict tool schemas; node IDs in tool arguments are targets, never proof of authorization. The root client's bearer must be issued by trusted local setup and mapped to the root context server-side. Owner-only emergency actions remain wallet actions outside this plugin.

Local setup supplies `ACT_RUNTIME_URL` as an HTTP(S) origin and `ACT_MCP_TOKEN` as a scoped bearer in the Codex process environment. The companion endpoint and token issuance are integration work; no fallback endpoint or shared key is included. With either setting absent, tools return a clear error and do not claim an on-chain action succeeded. For writes with an uncertain transport result, use `getOperationStatus` or inspect chain state before retrying.

Build with `pnpm --filter @agent-capital-tree/plugin build`, then run `pnpm --filter @agent-capital-tree/plugin test`. The committed `bundle/server.mjs` is the standalone artifact installed by a marketplace; rebuild it when the source changes. Install the repo marketplace from `.agents/plugins/marketplace.json` in a fresh Codex profile, and test against a real local companion before claiming P7 acceptance. Public universal plugin submission would require a reachable HTTPS MCP endpoint; this package supports the local Codex jury path.

The manifest layout follows [official OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins) and the server uses the [MCP TypeScript SDK](https://developers.openai.com/plugins/build/mcp-server).
