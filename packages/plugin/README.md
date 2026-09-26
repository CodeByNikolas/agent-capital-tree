# Agent Capital Tree Codex plugin

This local Codex plugin exposes read and write MCP tools through the user's own companion runtime. It does not hold a wallet key or provider credential. The portable `plugin.json`/`mcp.json` pair and compatibility `.codex-plugin/plugin.json`/`.mcp.json` pair point at the same bundled stdio server. There are no hooks.

The plugin sends `POST /v1/tools/<toolName>` with a JSON body and `Authorization: Bearer <ACT_MCP_TOKEN>` to `ACT_RUNTIME_URL`. The companion must bind that token to the actual root/worker context, check current on-chain authority, and perform or reject the requested operation. A model-supplied `agentId` is rejected by the strict tool schemas; node IDs in tool arguments are targets, never proof of authorization. The root client's bearer must be issued by trusted local setup and mapped to the root context server-side. Owner-only emergency actions remain wallet actions outside this plugin.

For a root Codex CLI that may wait on confirmed writes, use the bundled server as **one explicit MCP registration** in the root profile's `config.toml`. Do not also install the marketplace plugin in that profile: it would register the same tools a second time. Keep the profile's existing HomeBox CLIProxyAPI inference configuration. Add this table, replacing the bundle path with its absolute path in your checkout:

```toml
[mcp_servers.capital_tree_root]
command = "node"
args = ["/absolute/path/to/packages/plugin/bundle/server.mjs"]
tool_timeout_sec = 300
env_vars = ["ACT_RUNTIME_URL", "ACT_MCP_TOKEN"]
```

Start the companion separately. In the shell that launches this root Codex CLI, set `ACT_RUNTIME_URL` to the loopback `toolsOrigin` printed by the companion and load `ACT_MCP_TOKEN` from its private `root-session.token` file (mode `0600`), for example `export ACT_MCP_TOKEN="$(< /absolute/private/runtime-root/root-session.token)"` in Bash. Never paste or print the token. The companion issues a new root token on each start; refresh the environment before starting another Codex process. `env_vars` passes only those local variables to the stdio server, and neither credential belongs in Git or `config.toml`. Check the effective nonsecret setting with `codex mcp get capital_tree_root --json`: `tool_timeout_sec` must be `300` and `env_vars` must list both names. This path is verified for Codex CLI 0.154.0; it does not establish desktop plugin timeout behavior.

With either setting absent, tools return a clear error and do not claim an on-chain action succeeded. For writes with an uncertain transport result, use `getOperationStatus` or inspect chain state before retrying.

For a persistent **marketplace installation**, use `codex plugin marketplace add <checkout-path>` followed by `codex plugin add agent-capital-tree@agent-capital-tree`. `codex mcp list --json` should then show the enabled `capital-tree` server from the installed plugin cache. Set `ACT_RUNTIME_URL` and `ACT_MCP_TOKEN` in the launching shell as above before using its tools. Do not add the explicit `capital_tree_root` MCP registration to the same profile. The host CLI was verified at 0.157.0 for the read-only check; the worker image remains separately pinned at 0.154.0.

The cross-platform read-only installation check is `pnpm mcp:verify` after building the SDK and plugin. It needs no private runtime config or token. It makes a fresh temporary Codex profile, installs from this repository's marketplace, starts the **installed** MCP server, and calls `getTree` against the current USDC Sepolia controller through a local read-only bridge. The bridge exposes no write endpoint and does not start a model or operator companion. A completed root can therefore be inspected without reactivating its revoked runtime. This proves installation, all 16 tool registrations, MCP handshake and live chain read; it does not prove marketplace-installed financial writes or leave a persistent plugin install. Run `pnpm mcp:doctor` first for host prerequisites.

Build with `pnpm --filter @agent-capital-tree/plugin build`, then run `pnpm --filter @agent-capital-tree/plugin test`. The committed `bundle/server.mjs` is also the standalone artifact installed by a marketplace; rebuild it when the source changes. Its manifests do not set `tool_timeout_sec`; `codex mcp list --json` reports `null` for the installed server, which means Codex's default 60-second per-tool timeout. The documented plugin-scoped config controls enablement and approval policy, not this timeout; an attempted `tool_timeout_sec` override there did not change the effective setting in 0.154.0. Use the explicit registration above for long root writes. Public universal plugin submission would require a reachable HTTPS MCP endpoint; this package supports the local Codex jury path.

The manifest layout follows [official OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins) and the server uses the [MCP TypeScript SDK](https://developers.openai.com/plugins/build/mcp-server).
