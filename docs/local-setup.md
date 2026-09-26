# Local companion and MCP setup

## Fast jury check: read-only MCP on Windows, macOS or Linux

With Node 22+, pnpm and Codex CLI installed, run the following in PowerShell or Bash. The `work/rami` branch contains this current proof until it is integrated into the default branch. **If you are already in a checkout containing `package.json`, do not clone again**; run the `pnpm` commands there. A second `git clone` inside the project creates an unnecessary nested repository. No wallet, private configuration, Docker, runtime bearer, operator or team laptop is needed. Internet access to the public app and Sepolia RPC is required.

For a new checkout only:

```text
git clone --branch work/rami https://github.com/CodeByNikolas/agent-capital-tree.git
cd agent-capital-tree
```

From the checkout root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @agent-capital-tree/sdk build
pnpm --filter @agent-capital-tree/plugin build
pnpm mcp:doctor
pnpm mcp:verify
pnpm mcp:chat-verify
```

`mcp:verify` creates a fresh temporary Codex profile, installs the local marketplace plugin, confirms exactly one enabled `capital-tree` MCP and all 16 tools, then calls the installed server's `getTree` on the current public USDC root. Its temporary loopback bridge implements **only** `getTree`; a write request is rejected. The profile is removed afterwards. `mcp:chat-verify` separately starts the permanent-use read-only STDIO server, confirms it advertises **only** `getTree`, and performs a live chain read. Both prove MCP mechanics, not a personal app connection or financial write. The host Codex CLI may be newer than the separately pinned Linux worker CLI 0.154.0. `ACT_APP_URL` and `ACT_SEPOLIA_RPC_URL` optionally override public test endpoints; neither is a secret. Do not use these tests to replay the completed payment/root.

## Use the read-only MCP in Codex inside the ChatGPT desktop app

The proof above does **not** leave an MCP installed in your personal profile. To use `getTree` in an actual Codex chat, stay in the checkout root and register the local STDIO server once. In PowerShell:

```powershell
$actRepo = (Get-Location).Path
$actNode = (Get-Command node).Source
codex mcp add capital_tree_readonly -- $actNode (Join-Path $actRepo 'scripts/mcp-readonly-server.mjs')
codex mcp get capital_tree_readonly --json
```

In Bash:

```sh
codex mcp add capital_tree_readonly -- "$(command -v node)" "$PWD/scripts/mcp-readonly-server.mjs"
codex mcp get capital_tree_readonly --json
```

The resulting configuration contains only the Node executable and an absolute path to the script; no bearer or wallet key is needed. If `capital_tree_readonly` already exists, inspect it with `codex mcp get capital_tree_readonly --json` before changing anything. For a GUI-only route, use ChatGPT desktop **Settings → MCP servers → Add server → STDIO**, choose `node` as command and the script's absolute path as its argument, then Save and Restart. [OpenAI's MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) says the desktop app and Codex CLI share MCP configuration and `/mcp` in the composer lists connected servers. Do not add both GUI and CLI registrations under different names in the same profile.

Open a **new Codex chat** in the ChatGPT desktop app, select this project, type `/mcp` and confirm `capital_tree_readonly` is enabled. Then ask:

> Use the `capital_tree_readonly` MCP server's `getTree` tool with `rootId: "1"`. Report `source.chainId`, `source.blockNumber`, `source.observedAt`, the node count and the root vault. Do not use the shell, web browsing, another tool or any write action.

The answer should name Sepolia chain `11155111`, two nodes in the current demo tree and a recent block. Check the block and vault against the [public dashboard](https://agent-capital-tree-silk.vercel.app/tree?vault=0xAc5378EdA34f38A7fd34BB808B1b5492aF499bcf). The dashboard and Codex independently read Sepolia; the browser **cannot inspect the local STDIO session**, so its `/mcp` page shows the connection path and instructions, not an automatic live-connected badge. To remove this personal read-only registration later, run `codex mcp remove capital_tree_readonly` after confirming its name with `codex mcp list`.

This is **Codex in the ChatGPT desktop app**, not a normal chat at chatgpt.com. ChatGPT web does not read local Codex config or start this STDIO process; it requires a remote MCP-backed plugin or tunnel, neither of which this project currently provides. The [official distinction](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) matters for jury instructions. Do not confuse this one-tool read-only server with the full 16-tool companion plugin; keep them in separate Codex profiles to avoid duplicate `getTree` tools.

## Full agent actions: Linux companion only

The remainder is the Linux/Codex CLI path. On Windows, use WSL2 with Linux-local paths and a working Docker integration; native PowerShell execution of `packages/runtime/cli.mjs` deliberately fails with a WSL2 message. Native macOS and cross-platform Docker-companion onboarding have not been independently verified. These instructions are not a claim that a fresh Judge laptop can already perform financial writes. Desktop-app environment inheritance is also unverified. The Docker worker uses a pinned Linux Codex binary. Keep the owner wallet separate from the runtime operator; never import your owner key into the companion.

## 1. Prepare the checkout and worker

Install Node 22, pnpm 11.13.1 and Docker accessible to your non-root user. Your worker inference needs your own reachable CLIProxyAPI endpoint and credential; a Codex login alone is not sufficient.

```sh
git clone --branch work/rami --recurse-submodules https://github.com/CodeByNikolas/agent-capital-tree.git
cd agent-capital-tree
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
node packages/runtime/build-worker-image.mjs /absolute/path/to/linux-codex EXPECTED_SHA256
```

Use Codex 0.154.0 and independently verify the binary SHA-256. Record the immutable image ID printed by the builder. Rebuild after plugin/runtime changes; an old image contains the old MCP tool schemas. See the [runtime guide](../packages/runtime/README.md) for isolation and image details.

## 2. Create your root

Open [Setup](https://agent-capital-tree.vercel.app/setup), connect your Sepolia wallet and create a new root. Get official Test-USDC from the Circle faucet linked in the app, then fund the vault with your owner wallet. DEMO-USD is a separate valueless pool quote. Record your new internal root ID and the current controller address from `deployments/usdc-sepolia.json`. Use your own new root for agent tasks.

## 3. Configure and prepare the operator

Outside the checkout, create a private directory (mode 0700), a JSON config (0600), and a raw CLIProxyAPI credential file (0600), all owned by your user. Do not paste credentials into chat or commit them. Example config; replace every placeholder:

```json
{
  "runtimeRoot": "/absolute/private/runtime",
  "rootId": "YOUR_NEW_ROOT_ID",
  "rpcUrl": "https://your-sepolia-rpc.example",
  "controller": "0x17a932987f3cAcFec067c4C1bbE6946963d87F13",
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

This prints the **public operator address**, not its key. In your root's Setup page, use **Bind operator** to authorize that address and set its mandate. Fund the operator address with Sepolia ETH for its transactions; depositing Test-USDC into the vault does not pay gas. `childGasWei` is a separate optional ETH grant for each spawned child; zero gives no grant. Size it from current fees and the task, within the runtime cap described in the runtime guide. A read-only child task does not require child transaction gas.

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

### Optional: official Test-USDC service purchases

The current USDC contract version has an explicit `pay` capability. Use the current controller and a fresh private runtime directory; a runtime directory is bound to one controller and root. The current public deployment status is recorded in `STATUS.md` and `deployments/usdc-sepolia.json`.

With a USDC-compatible controller and a PAY-authorized operator, add an operator-approved service to the private companion configuration:

```json
{
  "paymentServices": [{
    "id": "research",
    "url": "https://your-sepolia-service.example/research",
    "payTo": "0xYourServiceRecipientAddress",
    "maxAmount": "10000"
  }]
}
```

Replace the illustrative URL/address with a real service that supports x402 v2 `exact`, Ethereum Sepolia (`eip155:11155111`) and Circle USDC. `10000` raw units equals **0.01 Test-USDC**. HTTPS is required except for explicit loopback demo URLs. No URL, network or payee supplied by a model can override this configuration. The hosted x402.org facilitator currently does not advertise Ethereum Sepolia; compatible settlement infrastructure is required.

The agent calls `getPaymentServices`, then `purchaseService` with the service ID, a maximum raw amount and a fresh 32-byte `operationKey`. On timeout it must reuse the same key and arguments. If an unused authorization expires, stop and reconcile the onchain nonce and merchant outcome with the operator; the prototype does not automatically replace or re-sign expired purchases. Do not delete the journal or generate a replacement key to bypass this condition. The companion persists the signed EIP-3009 authorization before sending it, checks current ENS authority, and independently verifies the settlement’s USDC Transfer and AuthorizationUsed events. The agent’s signature is wrapped for its vault’s ERC-1271 verifier; the agent pays from its vault, not from its operator EOA. Nonces bind the current authority generation. Revocation and policy restrictions apply when the authorization is settled.

The companion’s service allowlist is a runtime restriction. A compromised operator key can sign payments to other recipients allowed by the onchain PAY policy; this release does not provide an onchain merchant allowlist. Each amount ceiling is per payment, not a cumulative spending budget. The vault’s actual allocated balance remains the total financial exposure. Service responses are untrusted data; neither a valid payment nor this demonstration proves their quality.

For the controlled demo seller, `scripts/lib/x402-demo-service.mjs` provides a loopback-only 0.01-USDC research endpoint, explicit payer allowlist, official facilitator integration and durable response caching. An interrupted ambiguous settlement fails closed and requires reconciliation instead of charging again. It is not a production merchant platform.
