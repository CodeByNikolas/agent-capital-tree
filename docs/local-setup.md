# Local companion and MCP setup

This is the Linux/Codex CLI path. Desktop-app environment inheritance and a native macOS runtime have not been independently verified. The Docker worker uses a pinned Linux Codex binary. Keep the owner wallet separate from the runtime operator; never import your owner key into the companion.

## 1. Prepare the checkout and worker

Install Node 22, pnpm 11.13.1 and Docker accessible to your non-root user. Your worker inference needs your own reachable CLIProxyAPI endpoint and credential; a Codex login alone is not sufficient.

```sh
git clone --recurse-submodules https://github.com/CodeByNikolas/agent-capital-tree.git
cd agent-capital-tree
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
node packages/runtime/build-worker-image.mjs /absolute/path/to/linux-codex EXPECTED_SHA256
```

Use Codex 0.154.0 and independently verify the binary SHA-256. Record the immutable image ID printed by the builder. Rebuild after plugin/runtime changes; an old image contains the old MCP tool schemas. See the [runtime guide](../packages/runtime/README.md) for isolation and image details.

## 2. Create your root

Open [Setup](https://agent-capital-tree.vercel.app/setup), connect your Sepolia wallet and create a new root. Claim demo tokens and fund it using the existing owner-wallet actions. Record the new numerical root ID. Roots 2, 5 and 9 are retired; root 1 is shared seed liquidity. Do not use these for new worker tasks.

## 3. Configure and prepare the operator

Outside the checkout, create a private directory (mode 0700), a JSON config (0600), and a raw CLIProxyAPI credential file (0600), all owned by your user. Do not paste credentials into chat or commit them. Example config; replace every placeholder:

```json
{
  "runtimeRoot": "/absolute/private/runtime",
  "rootId": "YOUR_NEW_ROOT_ID",
  "rpcUrl": "https://your-sepolia-rpc.example",
  "controller": "0x55caFFf719B5FA70c0e8942eEe2C7EE6B8c7Db6b",
  "upstream": "https://your-cliproxyapi.example/v1",
  "providerTokenFile": "/absolute/private/provider-token",
  "imageId": "sha256:YOUR_BUILT_IMAGE_ID",
  "models": ["gpt-6-luna", "gpt-6-sol"],
  "childGasWei": "0"
}
```

```sh
node packages/runtime/cli.mjs prepare-root /absolute/private/config.json
```

This prints the **public operator address**, not its key. In your root's Setup page, use **Bind operator** to authorize that address and set its mandate. Fund the operator address with Sepolia ETH for its transactions; depositing ACT-A into the vault does not pay gas. `childGasWei` is a separate optional ETH grant for each spawned child; zero gives no grant. Size it from current fees and the task, within the runtime cap described in the runtime guide. A read-only child task does not require child transaction gas.

## 4. Start the companion

```sh
node packages/runtime/cli.mjs start /absolute/private/config.json
```

This starts with public-chain writes disabled. Keep this terminal running. It prints a loopback tools URL and a private root-token file path. Use the exact values in the next step. Restarting rotates the root token.

## 5. Register MCP in Codex CLI

In the Codex profile's `config.toml`, add this single registration; replace the repository path. Do not also enable the marketplace installation in the same profile.

```toml
[mcp_servers.capital_tree_root]
command = "node"
args = ["/absolute/path/to/agent-capital-tree/packages/plugin/bundle/server.mjs"]
tool_timeout_sec = 300
env_vars = ["ACT_RUNTIME_URL", "ACT_MCP_TOKEN"]
```

In a second Bash terminal, set the printed loopback URL and read the private token without displaying it, then launch Codex using your existing CLIProxyAPI configuration:

```sh
export ACT_RUNTIME_URL='http://127.0.0.1:PORT_PRINTED_BY_COMPANION'
export ACT_MCP_TOKEN="$(< /absolute/private/runtime/root-session.token)"
codex
```

Use `codex mcp get capital_tree_root --json` to check the registration and 300-second timeout. See the [plugin guide](../packages/plugin/README.md) for installation details and the marketplace-write limitation.

## 6. Read, then perform one controlled spawn

First ask: “Use Capital Tree MCP to read my root and effective policy. Report the owner, operator, balances and allowed actions. Do not write transactions.”

For a write test, stop the companion with Ctrl-C and restart explicitly:

```sh
node packages/runtime/cli.mjs start /absolute/private/config.json --enable-sepolia-writes
```

Refresh the printed URL/token in the launching terminal and restart the Codex session. Ask it to use **our MCP `spawnChild`**, with `name: "researcher"`, a fresh operation key, a small allocation and narrower permissions. Give the child only a read-and-report task initially. The name must be lowercase ASCII, begin with a letter, and contain at most 31 letters/digits/hyphens; it must be available under its parent. Reuse the exact same operation key and arguments when reconciling an uncertain result. Never create a new operation key just because the original call timed out.

The companion starts a separate Docker Codex worker after confirmed allocation. A native Codex subagent does not automatically become a capital worker. Verify the new child and its receipt in the dashboard. For another test choose a new name and operation key only after the previous result is known.

## Limits and troubleshooting

- No tools: check the bundle path, environment inheritance and effective MCP registration.
- Unauthorized: re-read the rotated token; verify root ID, operator binding and current mandate.
- No spend: check the explicit writes flag and operator ETH, separately from vault token balances.
- Child cannot transact: check its own gas, rights, expiry and inherited limits.
- History unavailable: MultiBaas configuration is optional in the local companion. The public dashboard has its own configured indexer; see the runtime guide for adding a private read key.
- A transport timeout is not evidence that a transaction failed. Reconcile operation status and chain state before retrying.

Independent external-user onboarding remains an acceptance gate. These instructions describe implemented components; they do not claim that every host or Codex desktop configuration has been tested.
