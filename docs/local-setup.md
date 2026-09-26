# Local companion and MCP setup

This is the Linux/Codex CLI path for the current **Circle USDC deployment on Ethereum Sepolia**. Desktop-app environment inheritance and a native macOS runtime have not been independently verified. Independent setup on another person's machine is still an acceptance gate; follow the checks below and report where your environment differs. Keep the owner wallet separate from the runtime operator; never import your owner key into the companion.

## 1. Prepare the checkout and worker

You need a Sepolia-capable browser wallet, Sepolia ETH for wallet and operator transactions, a Sepolia RPC URL, your own reachable **CLIProxyAPI** endpoint and credential, and access to `gpt-6-sol` and `gpt-6-luna` through that endpoint. The endpoint must support the Responses API at `/v1/responses`. A Codex login does not supply worker inference. Do not use another inference provider or a direct OpenAI API credential for this setup.

On a Linux host, install Node 22, pnpm 11.13.1, Docker accessible to your non-root user, and **Codex CLI 0.154.0**. Check the prerequisites before continuing:

```sh
node --version
pnpm --version
codex --version
docker info --format '{{.Architecture}}'
```

Use the [official Codex CLI installation guide](https://developers.openai.com/codex/cli/) to obtain the CLI, but pin version `0.154.0` for this worker image. Do not run an unreviewed install script. The image builder requires the **Linux ELF executable**, not an npm shell wrapper, for the same architecture as the Docker daemon. Locate it and independently verify its SHA-256 against your trusted release source. The hash printed by your own downloaded file is not an independent expected hash.

```sh
git clone --recurse-submodules https://github.com/CodeByNikolas/agent-capital-tree.git
cd agent-capital-tree
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
node packages/runtime/build-worker-image.mjs /absolute/path/to/linux-codex TRUSTED_64_CHARACTER_SHA256
```

Record the immutable `sha256:` image ID printed by the builder for the config in step 3. Rebuild after plugin/runtime changes; an old image contains the old MCP tool schemas. See the [runtime guide](../packages/runtime/README.md) for isolation and image details.

Configure the **root Codex CLI** to use that same CLIProxyAPI endpoint. In your user-level `~/.codex/config.toml` (or a separate user-level Codex profile), add the following values, merging them with existing settings rather than replacing the whole file. Provider settings in a repository `.codex/config.toml` are ignored. Load the key from a private file in the shell that launches Codex; keep it out of TOML and Git.

```toml
model = "gpt-6-sol"
model_provider = "act_cliproxyapi"

[model_providers.act_cliproxyapi]
name = "My CLIProxyAPI"
base_url = "https://your-cliproxyapi.example/v1"
env_key = "ACT_INFERENCE_KEY"
wire_api = "responses"
```

The `base_url` must point to **your CLIProxyAPI**, including `/v1`, and the model aliases must exist on that service. [Official Codex configuration](https://learn.chatgpt.com/docs/config-file/config-advanced#custom-model-providers) describes user-level custom providers. Test it with a real model call after creating the credential file in step 3.

## 2. Create your root

Open [Setup](https://agent-capital-tree.vercel.app/setup), connect your wallet on **Ethereum Sepolia (chain 11155111)**, and select **Launch a new root vault** (or **Create another root** if another vault is already open). Choose a unique lowercase ENS label and a mandate that includes only the actions and token limits your operator needs; an expiry cannot exceed the project namespace expiry shown by the form. The owner wallet needs Sepolia ETH for creation, funding, and operator binding. Get official test USDC from the [Circle faucet](https://faucet.circle.com/), then use **Fund root** with your owner wallet. DEMO-USD is a separate valueless pool quote; use **Get DEMO-USD** for its one-time faucet claim only if you want to test liquidity positions. Use your own new root for agent tasks; **Open live demo** is someone else's existing tree and is for inspection.

The browser navigates by ENS name or vault contract address, but the local companion still needs the controller's numeric `rootId`. After creating your root, copy its **root** ENS name or vault address from the dashboard and open `https://agent-capital-tree.vercel.app/api/resolve-root?q=YOUR_ENS_NAME` (URL-encode your value). The JSON response has `rootId`, `nodeId`, `vault`, and `rootVault`; for a root, `rootId` and `nodeId` match. Copy **`rootId`** into the config below. This is an internal onchain controller index, not another wallet or contract. Read the current controller address from [`deployments/usdc-sepolia.json`](../deployments/usdc-sepolia.json); do not use archived deployment manifests.

## 3. Configure and prepare the operator

Outside the checkout, create a private directory (mode `0700`), a JSON config (mode `0600`), and a file containing **only** your raw CLIProxyAPI credential (mode `0600`), all owned by your user. For example, create the files without printing the secret:

```sh
ACT_SETUP_DIR="$HOME/.agent-capital-tree-local"
install -d -m 700 "$ACT_SETUP_DIR"
(umask 077; touch "$ACT_SETUP_DIR/provider-token" "$ACT_SETUP_DIR/config.json")
chmod 600 "$ACT_SETUP_DIR/provider-token" "$ACT_SETUP_DIR/config.json"
${EDITOR:-vi} "$ACT_SETUP_DIR/provider-token"
${EDITOR:-vi} "$ACT_SETUP_DIR/config.json"
```

With the user-level Codex provider configured in step 1, confirm model access before starting the companion:

```sh
export ACT_INFERENCE_KEY="$(< "$ACT_SETUP_DIR/provider-token")"
codex exec --ephemeral "Reply with READY."
```

The companion uses the same raw credential through `providerTokenFile`; its workers receive only short-lived scoped broker tokens. Reload `ACT_INFERENCE_KEY` in any new shell that launches root Codex.

Use the resulting absolute paths for `providerTokenFile` and the CLI commands below. Do not put the credential, the operator key, or `root-session.token` in chat, shell arguments, logs, or Git. Example config; replace every placeholder and make `runtimeRoot` a **new, persistent** private directory for this one root and controller:

```json
{
  "runtimeRoot": "/absolute/private/runtime",
  "rootId": "YOUR_NEW_ROOT_ID",
  "rpcUrl": "https://your-sepolia-rpc.example",
  "controller": "0x7eDFa3D484d64b6bA3b5b2bcef51147E57133FFB",
  "upstream": "https://your-cliproxyapi.example/v1",
  "providerTokenFile": "/absolute/private/provider-token",
  "imageId": "sha256:YOUR_BUILT_IMAGE_ID",
  "models": ["gpt-6-luna", "gpt-6-sol"],
  "childGasWei": "0"
}
```

`upstream` must be your CLIProxyAPI `/v1` URL, not a `/responses` URL. The runtime uses the credential file for this endpoint. Preserve `runtimeRoot`, including its encrypted key files and `keys/master.password`; losing either makes the bound operator key unavailable. Do not reuse that directory for another root or controller.

```sh
node packages/runtime/cli.mjs prepare-root /absolute/private/config.json
```

This prints the **public operator address**, not its key. In your root's Setup & control page, use **Bind operator** to authorize that address and set its mandate. Wait for the wallet transaction to confirm and verify the bound address in the live root before starting the companion. The **vault does not need ETH**: it holds USDC and DEMO-USD, while the external signer pays transaction gas. Fund the operator address with Sepolia ETH for its own transactions; depositing USDC into the vault does not pay gas. A child spawn on the current public deployment used about 3.56 million gas including its ENS registry and allocation, so estimate ETH from current gas prices and keep headroom. `childGasWei` is a separate optional ETH grant for each spawned child; zero gives no grant. Size it from current fees and the task, within the runtime cap described in the runtime guide. A read-only child task does not require child transaction gas; x402 settlement gas is normally paid by the service facilitator, while other child onchain writes need child ETH.

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

In a second Bash terminal, load the CLIProxyAPI credential and the companion's printed loopback URL and private token without displaying either credential, then launch Codex using your existing CLIProxyAPI configuration:

```sh
export ACT_RUNTIME_URL='http://127.0.0.1:PORT_PRINTED_BY_COMPANION'
export ACT_MCP_TOKEN="$(< /absolute/private/runtime/root-session.token)"
export ACT_INFERENCE_KEY="$(< /absolute/private/provider-token)"
codex
```

Use `codex mcp get capital_tree_root --json` to check the registration and 300-second timeout. See the [plugin guide](../packages/plugin/README.md) for installation details and the marketplace-write limitation.

## 6. Read, then perform one controlled spawn

First ask: “Use Capital Tree MCP `getTree` with my numeric root ID and `getEffectivePolicy` for that root. Report the owner, operator, balances and allowed actions. Do not write transactions.”

For a write test, stop the companion with Ctrl-C and restart explicitly:

```sh
node packages/runtime/cli.mjs start /absolute/private/config.json --enable-sepolia-writes
```

Refresh the printed URL/token in the launching terminal and restart the Codex session. Ask it to use **our MCP `spawnChild`** with these arguments, replacing `operationKey` with a fresh `0x`-prefixed 32-byte hex value. The current manifest's USDC address is shown here; check it against the manifest when you run this. `10000` raw six-decimal units equals 0.01 USDC. The parent must have `delegate`, sufficient free USDC, and an active mandate.

```json
{
  "operationKey": "0xYOUR_64_HEX_CHARACTERS",
  "name": "researcher",
  "task": "Read your own vault and effective policy with Capital Tree MCP, then report the result. Do not send transactions.",
  "model": "gpt-6-luna",
  "asset": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "amount": "10000",
  "restrictions": {
    "capabilities": ["delegate"],
    "allowedAssets": ["0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"],
    "maxPerAction": { "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238": "0" }
  }
}
```

The companion requires at least one currently active onchain capability before dispatching a worker. This example retains `delegate` but sets its only allowed asset's per-action limit to zero and grants no child ETH (`childGasWei: "0"` in step 3). The task is read-only, while the onchain mandate still includes a restricted delegation right; do not describe it as a pure read-only mandate. The parent must itself have `delegate` and allow USDC. The name must be lowercase ASCII, begin with a letter, and contain at most 31 letters/digits/hyphens; it must be available under its parent. Record the key and exact arguments privately before calling the tool. On an uncertain result, call `getOperationStatus` with that key and check the onchain child and receipt. Reuse the exact same key and arguments for reconciliation; never create a new key just because the original call timed out.

The companion starts a separate Docker Codex worker after confirmed allocation. A native Codex subagent does not automatically become a capital worker. Verify the new child and its receipt in the dashboard. For another test choose a new name and operation key only after the previous result is known.

### Jury scenario: a 10 USDC worker with two applications

Only run this scenario after the owner has explicitly authorized a **10 official Sepolia test USDC** allocation and the two actions. This is testnet capital, not 10 real dollars or an automatic spawn budget. Give Codex a natural-language task such as:

> Use Capital Tree MCP to create one funded child worker named `jury-researcher`. Allocate exactly 10 official Sepolia test USDC (`10000000` raw units) from my root vault. Give it only `pay` and `swap`, allow official USDC and the configured valueless DEMO-USD pool token, cap any USDC payment or swap input at 1 USDC (`1000000` raw units), and set an expiry within my root's current mandate. Have it inspect the configured x402 services, buy one approved research result for at most 0.01 USDC (`10000` raw units), then make one bounded exact-input USDC-to-DEMO-USD Uniswap swap of at most 1 USDC. Before the swap, choose an explicit positive minimum output and a near-term deadline; report the chosen price protection and receipt. Reconcile uncertain operations with their original keys before any retry.

The root must already have `delegate`, `pay` and `swap` as needed to pass the child rights, allow **both** pool tokens, permit at least 1 USDC per action, hold 10 USDC of free balance, and remain active through the proposed child expiry. The child restrictions for this request must explicitly set `capabilities: ["pay", "swap"]`, `allowedAssets` to both addresses in the current manifest, `maxPerAction` for USDC to `"1000000"`, and a future Unix `expiresAt` no later than the parent expiry. The `spawnChild` allocation uses `asset` set to official USDC and `amount: "10000000"`; a task prompt alone cannot set these onchain limits. If the parent lacks any prerequisite, stop before the spawn and ask the owner to set an appropriate mandate or fund the vault. The example is not permission to broaden an existing mandate.

Configure an approved Sepolia x402 seller in `paymentServices` as described below. The worker should call `getPaymentServices` and use only its listed `serviceId` and price ceiling; `purchaseService.maxAmount` is `"10000"` for the 0.01-USDC purchase. x402 settlement normally uses facilitator gas. A swap is a direct onchain transaction: set a bounded nonzero `childGasWei` in the private companion config and fund the parent operator with enough Sepolia ETH for spawn, gas grant and its own transactions. The child vault itself does not need ETH. For the swap, use `tokenIn` as USDC, `amountIn` at most `"1000000"`, a positive `minAmountOut` chosen from current pool conditions and acceptable slippage, and an explicit near-term Unix `deadline`; neither a zero minimum nor an old quote protects the trade. The DEMO-USD output is valueless and is not a USD return.

Record the spawn key and full arguments privately. If the tool call times out or its result is unclear, check `getOperationStatus`, the current tree and the transaction receipt before taking another action. Retry only with the same key and arguments. Apply the purchase-specific nonce and merchant reconciliation below to uncertain x402 results. Verify the child's actual rights, vault allocation, payment and swap receipts in the dashboard and onchain; a native Codex subagent has none of this custody or authority.

## Success checks

- The live Setup & control page shows your root vault and the operator address printed by `prepare-root`; `start` accepts the same root/controller configuration.
- The root MCP `getTree` returns that root's current onchain balances and agent authority, with no preview balances. `getEffectivePolicy` shows the intended limits.
- The controlled `spawnChild` returns a confirmed child ID; the dashboard's Agent tree shows its ENS name, vault and allocation. Compare its transaction receipt with the live tree before issuing another operation.
- The child can report its vault state. Its effective policy shows the zero USDC per-action limit and the narrowly scoped `delegate` capability; attempted capital movement beyond that limit must fail. A task's text alone does not grant rights.

These checks require a real fresh-wallet run on an independent machine. They have not yet been completed as one external-user acceptance test.

## Limits and troubleshooting

- No tools: check the bundle path, environment inheritance and effective MCP registration.
- Unauthorized: re-read the rotated token; verify root ID, operator binding and current mandate.
- No spend: check the explicit writes flag and operator ETH, separately from vault token balances.
- Child cannot transact: check its own gas, rights, expiry and inherited limits.
- History unavailable: MultiBaas configuration is optional in the local companion. The public dashboard has its own configured indexer; see the runtime guide for adding a private read key.
- A transport timeout is not evidence that a transaction failed. Reconcile operation status and chain state before retrying.

Independent external-user onboarding remains an acceptance gate. These instructions describe implemented components; they do not claim that every host or Codex desktop configuration has been tested.

### Optional: official USDC service purchases

The current USDC contract version has an explicit `pay` capability. Use the current controller and a fresh private runtime directory; a runtime directory is bound to one controller and root. The current public deployment status is recorded in `STATUS.md` and `deployments/usdc-sepolia.json`.

With a USDC-compatible controller and a PAY-authorized operator, add an operator-approved `paymentServices` property to the **same private config JSON from step 3** (including the comma after its preceding property):

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

Replace the illustrative URL/address with a real service that supports x402 v2 `exact`, Ethereum Sepolia (`eip155:11155111`) and Circle USDC. `10000` raw units equals **0.01 USDC**. HTTPS is required except for explicit loopback demo URLs. No URL, network or payee supplied by a model can override this configuration. The hosted x402.org facilitator currently does not advertise Ethereum Sepolia; compatible settlement infrastructure is required.

The agent calls `getPaymentServices`, then `purchaseService` with the service ID, a maximum raw amount and a fresh 32-byte `operationKey`. On timeout it must reuse the same key and arguments. If an unused authorization expires, stop and reconcile the onchain nonce and merchant outcome with the operator; the prototype does not automatically replace or re-sign expired purchases. Do not delete the journal or generate a replacement key to bypass this condition. The companion persists the signed EIP-3009 authorization before sending it, checks current ENS authority, and independently verifies the settlement’s USDC Transfer and AuthorizationUsed events. The agent’s signature is wrapped for its vault’s ERC-1271 verifier; the agent pays from its vault, not from its operator EOA. Nonces bind the current authority generation. Revocation and policy restrictions apply when the authorization is settled.

The companion’s service allowlist is a runtime restriction. A compromised operator key can sign payments to other recipients allowed by the onchain PAY policy; this release does not provide an onchain merchant allowlist. Each amount ceiling is per payment, not a cumulative spending budget. The vault’s actual allocated balance remains the total financial exposure. Service responses are untrusted data; neither a valid payment nor this demonstration proves their quality.

For the controlled demo seller, `scripts/lib/x402-demo-service.mjs` provides a loopback-only 0.01-USDC research endpoint, explicit payer allowlist, official facilitator integration and durable response caching. An interrupted ambiguous settlement fails closed and requires reconciliation instead of charging again. It is not a production merchant platform.
