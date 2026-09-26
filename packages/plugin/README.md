# Kanoki Codex plugin

The default installed plugin starts the standalone Kanoki capital MCP with 19 tools. It needs no separate companion process, runtime URL, bearer token, root ID or manually prepared key. After installation, ask Kanoki to prepare your vault, confirm the guided wallet setup, and return to chat. The vault is remembered across restarts. Linux or Windows/WSL2 with Node 22+ is required for signing.

Build SDK, MultiBaas, plugin and runtime in that order. The runtime build emits `bundle/capital.mjs` with embedded public deployment manifests. `capital.mjs` is the installed launcher. Keep its bundled visual assets. The older `bundle/server.mjs` remains the scoped worker bridge for explicitly configured autonomous workers; the advanced sections below describe that separate mode.

Every tool response includes dashboard-style PNGs, actual local Markdown image links and Mermaid fallback, including successful actions, unconfirmed outcomes and argument errors. The host is instructed to embed all images in its final answer. `bundle/visual-assets` contains the portable WASM renderer and licensed dashboard fonts; ship it with `bundle/server.mjs`. Rendering runs locally, adds no chain reads and never repeats a write. Large trees use multiple readable image pages from one block. Temporary image files outlive the MCP process so local chat links remain valid until OS cleanup. MCP image delivery and actual GUI rendering are separate checks.

## Optional autonomous-worker bridge

The separate worker bridge sends `POST /v1/tools/<toolName>` with a JSON body and `Authorization: Bearer <ACT_MCP_TOKEN>` to `ACT_RUNTIME_URL`. Its companion binds that token to the actual root/worker context and checks on-chain authority. These settings are not needed for the default capital plugin. Owner-only emergency actions remain wallet actions.

When work needs a funded child, call MCP `spawnChild` with an explicit asset, raw-unit allocation, task, model, idempotency key and narrower mandate. Native Codex subagents do not create vaults, ENS rights or allocations. For example, a jury-authorized 10 official Sepolia test USDC allocation is `amount: "10000000"`, not a default or real-dollar amount. A child making x402 purchases and Uniswap swaps needs distinct `pay` and `swap` capabilities, both pool assets allowed for swaps, per-action limits, a finite expiry, an approved service in the private runtime config, and separately funded Sepolia ETH for swap gas. See the [jury scenario](../../docs/local-setup.md#jury-scenario-a-10-usdc-worker-with-two-applications) for the full prompt and reconciliation steps.

For a root Codex CLI that may wait on confirmed writes, use **one explicit MCP registration** in the root profile. Do not also install the marketplace plugin in that profile: it would register the same tools a second time. The recommended Linux/WSL2 launcher reads the rotating token from the private runtime directory instead of placing it in Codex's environment. Use native OpenAI API-key inference with Luna High for autonomous workers; ChatGPT login or an explicitly configured CLIProxyAPI provider are alternatives. Add this table with the absolute paths to your checkout and private runtime root:
Do not put this table in the worker's dedicated `codexHome`: that profile stays free of manual MCP registrations and plugins.

```toml
[mcp_servers.kanoki]
command = "node"
args = ["/your/linux/checkout/packages/runtime/mcp-stdio.mjs", "/your/private/runtimeRoot"]
tool_timeout_sec = 300

```

Start the companion separately. It atomically writes `mcp-ready.json` and `root-session.token` in the owner-only runtime directory; the launcher checks their ownership, modes, Sepolia domain and loopback origin on each MCP start. Neither bearer nor provider credential belongs in Git, model output or Codex config. On a Windows Codex host, set `command = "wsl.exe"` and prepend `"--exec", "/absolute/linux/path/to/node"` to the arguments; find the path with `wsl --exec sh -lc 'command -v node'`. A bare `node` after `wsl --exec` failed under nvm because no login shell is loaded. Run the companion in the same default WSL2 distribution. This launcher path still needs a live WSL2/Docker acceptance test.
Historical native OpenAI API-key financial E2E with real Luna High inference passed on the retired pre-Kanoki controller; see [evidence](../../deployments/jury-openai-native.json). ChatGPT-login, desktop and Claude Code financial E2E remain open.
With either setting absent, tools return a clear error and do not claim an on-chain action succeeded. For writes with an uncertain transport result, use `getOperationStatus` or inspect chain state before retrying.

For a persistent **marketplace installation**, use `codex plugin marketplace add <checkout-path>` followed by `codex plugin add kanoki@kanoki`. `codex mcp list --json` should then show the enabled `kanoki` server from the installed plugin cache. The default capital plugin needs no runtime URL or bearer token. Ask it to prepare your one-time wallet setup. Do not add the explicit `kanoki` MCP registration to the same profile. The host CLI was verified at 0.157.0 for the read-only check; the worker image remains separately pinned at 0.154.0.

The installation check is `pnpm mcp:verify` after building the SDK, MultiBaas, plugin and runtime. It needs no private runtime config or token. It makes a fresh temporary Codex profile, installs from this repository's marketplace, starts the **installed** standalone capital MCP, and calls `getTree` against the current USDC Sepolia controller. This proves installation, all 19 tool registrations, MCP handshake and a live chain read without a separate bridge. The test requests no financial writes and does not prove marketplace-installed financial writes or leave a persistent plugin install. Run `pnpm mcp:doctor` first for host prerequisites.

For a **real keyless Codex or Claude chat**, use `scripts/mcp-readonly-server.mjs`. It registers `getTree`, `visualizeTree` and `prepareRootSetup`. A Tree call accepts an ID, full ENS name or vault address. Setup opens the review link in the normal system browser with the user's existing wallet profile; `openBrowser:false` disables opening. This tool is annotated as having a UI side effect, but never signs or submits a transaction. Do not use a chat-controlled browser for wallet injection. `pnpm mcp:chat-verify` tests the three tools; `pnpm mcp:settings` prints host paths. See [local setup](../../docs/local-setup.md). Do not register the keyless and companion servers together if duplicate `getTree` names would be confusing.

Build the plugin and then the runtime to refresh both committed bundles, then run `pnpm --filter @agent-capital-tree/plugin test`. The installed default uses `bundle/capital.mjs`; autonomous workers use `bundle/server.mjs`. The manifests do not set `tool_timeout_sec`. Use an explicit registration with an appropriate timeout for long root writes. This package supports local Codex installation; it is not a hosted HTTPS MCP service.

The manifest layout follows [official OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins) and the server uses the [MCP TypeScript SDK](https://developers.openai.com/plugins/build/mcp-server).
