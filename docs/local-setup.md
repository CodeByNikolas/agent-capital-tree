# Local companion and MCP setup

This is the Linux/Codex CLI path for the current **Circle USDC deployment on Ethereum Sepolia**.

Desktop-app environment inheritance and a native macOS runtime have not been independently verified. Independent setup on another person's machine is still an acceptance gate; follow the checks below and report where your environment differs.

A same-host acceptance run using the earlier CLIProxyAPI path completed browser setup, funded MCP spawn, x402 payment and Uniswap swap after the fixes recorded in [the acceptance report](../ACCEPTANCE.md). A subsequent native OpenAI API-key run with real `gpt-6-luna` / `high` responses passed funded MCP spawn, x402 payment and Uniswap swap; see [native evidence](../deployments/jury-openai-native.json). ChatGPT-login financial E2E remains unverified. Keep the owner wallet separate from the runtime operator; never import your owner key into the companion.

## Recommended: one-time Kanoki wallet setup

After installing the MCP, ask: **“Set up Kanoki with 0.10 Test-USDC.”** The chat calls `prepareRootSetup` without asking for an ENS name. Open its normal-browser link, connect your owner wallet and click **Set up Kanoki**. Confirm the displayed wallet requests. Return to chat; `getCapitalSetup` automatically recognizes the vault and its saved local signer, including after a restart.

The one guided setup creates the root, authorizes the local signer, deposits the shared USDC budget and tops the signer up to 0.01 native Sepolia ETH for gas. Current contracts can require up to five wallet confirmations (creation, authorization, USDC approval, deposit and gas). There is no manual root selection, operator-address copying, JSON profile, bearer token or separate runtime terminal. The owner key never enters the MCP. Completed deposits are never repeated; keep the same link to resume an interrupted setup.

The capital MCP exposes 19 useful tools. Unconfigured history, purchases and autonomous-worker spawning are omitted. `createChildVault` creates funded vaults managed by this chat, not autonomous model processes. Separate autonomous-worker configuration remains available below. Per-action policy and simulated gas checks still apply; funds and gas are finite.

### Install once

Supported signing hosts: Linux, or Windows with Node 22+ in the default WSL distribution. Native macOS/Windows signing and independent-laptop wallet E2E are not claimed. From the checkout:

```sh
pnpm --filter @agent-capital-tree/sdk build
pnpm --filter @agent-capital-tree/multibaas build
pnpm --filter @agent-capital-tree/plugin build
pnpm --filter @agent-capital-tree/runtime build
pnpm mcp:capital settings --enable-sepolia-writes
```

Register the printed command as `kanoki`, or install the bundled `kanoki@kanoki` plugin. Both start the same automatic capital flow. Do not register both in one profile. Existing chats need one reconnect after upgrading the MCP.

```powershell
$actScript = (Resolve-Path -LiteralPath 'packages/runtime/capital.mjs').Path
$actNode = (Get-Command node).Source
codex mcp add kanoki -- $actNode $actScript stdio --enable-sepolia-writes
```

The shared demo budget is 100000 raw units = 0.10 Test-USDC total, not per child and not a contract balance cap. Two children of 20000 each leave 60000 at the root. Reuse each child operation key and identical arguments on uncertain retries. Never repeat a deposit or use a new key to retry an uncertain allocation.

### Advanced existing-root recovery

Manual `selectCapitalRoot` and `prepareOperatorRecovery` are only for intentionally choosing an existing root with an unavailable signer. They are not part of new-user setup. A permanently revoked root cannot be restored. Historical root 4 is revoked and empty; its local profile was explicitly deleted. Do not fund it or use the obsolete `.main-onboarding` checkout.

## Fast jury check: read-only MCP on Windows, macOS or Linux

With Node 22+, pnpm and Codex CLI installed, run the following in PowerShell or Bash. **If you are already in a checkout containing `package.json`, do not clone again**; run the `pnpm` commands there. A second `git clone` inside the project creates an unnecessary nested repository. No wallet, private configuration, Docker, runtime bearer, operator or team laptop is needed. Internet access to the public app and Sepolia RPC is required.

For a new checkout only:

```text
git clone https://github.com/CodeByNikolas/agent-capital-tree.git
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
pnpm mcp:settings

```

`mcp:verify` creates a fresh temporary Codex profile, installs the local marketplace plugin, confirms exactly one enabled `capital-tree` MCP and all 17 tools, then calls its `getTree` with writes disabled. The profile is removed afterwards. `mcp:chat-verify` tests the permanent-use STDIO server's three keyless tools (`getTree`, `visualizeTree`, `prepareRootSetup`), including live ENS and vault resolution, data plus PNG from one block, and a bounded browser-wallet setup link. These tests do not send a transaction. `mcp:settings` prints the **actual absolute Node and script paths** for this checkout. `ACT_APP_URL` and `ACT_SEPOLIA_RPC_URL` optionally override public endpoints; neither is a secret.

## Use the read-only MCP in Codex inside the ChatGPT desktop app

The proof above does **not** leave an MCP installed in your personal profile. To use the keyless tools in an actual Codex chat, register the local STDIO server once. The exact paths are shown by `pnpm mcp:settings`. In PowerShell:

```powershell
$actScript = (Resolve-Path -LiteralPath 'scripts/mcp-readonly-server.mjs').Path
$actNode = (Get-Command node).Source
codex mcp add kanoki -- $actNode $actScript
codex mcp get kanoki --json
codex mcp list --json

```

In Bash:

```sh
test -f "$PWD/scripts/mcp-readonly-server.mjs" || { echo 'Run this from the current checkout root' >&2; exit 1; }
codex mcp add kanoki -- "$(command -v node)" "$PWD/scripts/mcp-readonly-server.mjs"
codex mcp get kanoki --json

```

The resulting configuration contains only the Node executable and an absolute path to the script; no bearer or wallet key is needed. If `kanoki` already exists, inspect it with `codex mcp get kanoki --json` before changing anything. If its script path does not exist, remove **only that entry** with `codex mcp remove kanoki`, then add it again using the resolved path. For a GUI-only route, use ChatGPT desktop **Settings → MCP servers → Add server → STDIO**; paste the **Command** and **Argument** printed by `pnpm mcp:settings`, then Save and Restart. [OpenAI's MCP documentation](https://learn.chatgpt.com/docs/extend/mcp) says the desktop app and Codex CLI share MCP configuration for the same host and `/mcp` lists connected servers. Do not add both GUI and CLI registrations under different names in the same profile. If a Codex-controlled shell reports an empty `codex mcp list` while the real desktop has entries, check `codex doctor --json`: the shell may be running under an isolated Codex home. Run the check in your normal PowerShell outside the agent sandbox.

Open a **new Codex chat** in the ChatGPT desktop app, select this project, type `/mcp` and confirm `kanoki` is enabled. Then ask:

> Use `kanoki.getTree` with `query: "capital.kanoki.eth"`. Show its graph and report its Sepolia block, observation time, root vault, balances and current authorized actions. Do not use shell or another source.

The answer should name Sepolia chain `11155111`, the current root ID and a recent block. Always read the current funding and rights from that snapshot: `capital` changed externally from empty to 0.10 Test-USDC with active rights during development. Do not assume an old balance or reuse it for a write test without checking its owner/operator. You can also pass a vault address or numeric root ID. The dashboard cannot inspect the local STDIO session.

Every MCP tool result includes dashboard-style PNGs, ready-to-use local Markdown image links and a Mermaid fallback, including setup, actions and errors. Codex is instructed to embed the returned image links in its answer automatically. Tree data and every image page use **one** chain snapshot; `visualizeTree` remains an alias. Images use the dashboard's dark green palette, Manrope and DM Mono. The bundled WASM renderer works without native graphics packages. Graphics remain in a per-session `act-mcp-visuals-*` directory in your OS temporary folder so chat links keep working after the MCP process closes; OS cleanup may eventually remove them. No raw provider errors or credentials are rendered. Host GUI image support remains a separate acceptance check; when images cannot be shown, render the supplied Mermaid instead of giving a prose-only response.

To start a new demo from the chat, call `prepareRootSetup` with a lowercase ENS label and `budgetRaw: "100000"` (0.10 Test-USDC maximum). It **automatically opens your normal system browser** with the existing profile and extensions. Make the browser with your wallet extension your OS default. Do not use a separate chat-controlled Chrome window: an isolated profile may lack wallet injection. `openBrowser:false` only prepares the link; tests use this by default. The response keeps a clickable URL if automatic opening fails. `browser.opened` confirms the OS launch request, not wallet detection or a signature.

The page pre-fills the label, narrow delegate/restrict/reclaim mandate and exact funding amount. Connect your wallet and review/sign the separate `createRoot`, optional exact USDC `approve`, `fundRoot`, and `setRootOperator` transactions. No key or token enters the link or chat. After creation, return to chat and read the new ENS name. Later Child operations use the authorized companion operator without a new owner signature at each step.

### Keep a visible MCP connection open on your desktop

Run `pnpm mcp:desktop` in a separate terminal. It starts the same local STDIO server, performs a live `getTree` read, prints `CONNECTED` with chain/block/node count and keeps its **own** connection open, checking it every minute. Ctrl+C stops it. This is an optional, honest status window; Codex and Claude still start **their own** STDIO process when a chat connects. The monitor is not a pairing service and the public dashboard cannot observe it.

### Claude Code and Claude Desktop

For Claude Code on the same laptop, use the same absolute paths printed by `pnpm mcp:settings`:

```powershell
$actScript = (Resolve-Path -LiteralPath 'scripts/mcp-readonly-server.mjs').Path
$actNode = (Get-Command node).Source
claude mcp add --scope user kanoki -- $actNode $actScript
claude mcp get kanoki

```

`claude mcp get` must show `Connected`. Then ask for `visualizeTree` in Claude Code. Claude may ask you to approve that read-only tool once. Do not grant a blanket write permission. This Claude Code configuration is **separate** from the Claude Desktop chat configuration. [Claude Code's MCP guide](https://code.claude.com/docs/en/mcp) explains local STDIO installation and scopes.

For Claude Desktop chat, open **Settings → Developer** and edit its local MCP configuration (`%APPDATA%\Claude\claude_desktop_config.json` on Windows). Merge the `kanoki` entry printed by `pnpm mcp:settings` under the existing `mcpServers` object; do not replace other servers. Fully quit and reopen Claude Desktop, then check **+ → Connectors** and Developer connection status. Anthropic documents this [local configuration](https://py.sdk.modelcontextprotocol.io/get-started/real-host/) and the [Desktop connection check](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop). A packaged `.mcpb` extension for one-click install via Settings → Extensions is **not** supplied yet; do not select a random remote connector, which would require a publicly reachable server. Claude Desktop chat itself has not yet been manually verified with this project.

This is a local Codex chat, not a normal chat at chatgpt.com. ChatGPT web does not read local Codex config or start this STDIO process. The [official distinction](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) matters for jury instructions. The keyless server prepares the owner-wallet setup but has no financial signer; the full 17-tool companion remains separate. Avoid registering both under different names in the same chat to prevent duplicate `getTree` tools.

## Full agent actions: Linux companion only

The remainder is the Linux/Codex CLI path. On Windows, use WSL2 with Linux-local paths and a working Docker integration; native PowerShell execution of `packages/runtime/cli.mjs` deliberately fails with a WSL2 message. Native macOS and cross-platform Docker-companion onboarding have not been independently verified. These instructions are not a claim that a fresh Judge laptop can already perform financial writes. Desktop-app environment inheritance is also unverified. The Docker worker uses a pinned Linux Codex binary. Keep the owner wallet separate from the runtime operator; never import your owner key into the companion.

## 1. Prepare the checkout and worker

You need a Sepolia-capable browser wallet, Sepolia ETH for wallet and operator transactions, and a Sepolia RPC URL. **Preferred inference setup: an OpenAI API key** with API billing and access to your chosen Codex model. API inference is billed separately from the child’s USDC allowance. ChatGPT/Codex login is an alternative; HomeBox CLIProxyAPI remains optional. Choose an exact model available through your selected authentication; `gpt-6-luna` with high reasoning was verified through the official OpenAI API; check current access to your chosen model.

On a Linux host, install Node 22, pnpm 11.13.1, Docker accessible to your non-root user, and **Codex CLI 0.154.0**. Check the prerequisites before continuing:

```sh
node --version
pnpm --version
codex --version
docker info --format '{{.Architecture}}'

```

Use the [official Codex CLI installation guide](https://developers.openai.com/codex/cli/) to obtain the CLI, but pin version `0.154.0` for this worker image. Do not run an unreviewed install script. The image builder and native launcher require the **same Linux ELF executable**, not an npm shell wrapper, for the same architecture as the Docker daemon. Locate it and independently verify its SHA-256 against your trusted release source. The hash printed by your own downloaded file is not an independent expected hash.

```sh
git clone https://github.com/CodeByNikolas/agent-capital-tree.git
cd agent-capital-tree
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
ACT_CODEX_BINARY=/absolute/path/to/linux-codex
node packages/runtime/build-worker-image.mjs "$ACT_CODEX_BINARY" TRUSTED_64_CHARACTER_SHA256

```

Record the immutable `sha256:` image ID printed by the builder for the config in step 3. Rebuild after plugin/runtime changes; an old image contains the old MCP tool schemas. See the [runtime guide](../packages/runtime/README.md) for isolation and image details.

The companion and `pnpm build` use the checked-in SDK ABI and need no contract submodules. If you also build or test the Solidity contracts, run `git submodule update --init --recursive` in this checkout first; the nested ENS and Uniswap dependencies make that a larger download.

### Preferred: OpenAI API key

Create a key in your [OpenAI API project](https://platform.openai.com/api-keys) with model access and API billing enabled. Create a dedicated private Codex home for the **host companion** and a raw key file outside the checkout and worker directories. Put only your OpenAI API key into the file using your editor; do not paste it into chat, command arguments or the JSON config.

```sh
ACT_SETUP_DIR="$HOME/.agent-capital-tree-local"
install -d -m 700 "$ACT_SETUP_DIR" "$ACT_SETUP_DIR/codex-home"
(umask 077; touch "$ACT_SETUP_DIR/openai-api-key")
chmod 600 "$ACT_SETUP_DIR/openai-api-key"
${EDITOR:-vi} "$ACT_SETUP_DIR/openai-api-key"

```

Set `openaiApiKeyFile` in step 3 to this file’s absolute path. No browser/device login is needed for this worker profile. The host uses the official [Codex app-server API-key flow](https://learn.chatgpt.com/docs/app-server) with ephemeral credential storage. The key is not copied into `auth.json`, worker mounts or worker environment variables. A configured missing or invalid key file fails without falling back to another login.

### Alternative: ChatGPT/Codex login

Omit `openaiApiKeyFile` from the config. Create `ACT_SETUP_DIR` and its private `codex-home` directory as above (no key file needed), then sign in to the dedicated worker profile:

```sh
CODEX_HOME="$ACT_SETUP_DIR/codex-home" "$ACT_CODEX_BINARY" -c 'cli_auth_credentials_store="file"' login
CODEX_HOME="$ACT_SETUP_DIR/codex-home" "$ACT_CODEX_BINARY" login status

```

Use `login --device-auth` if the host has no browser. These commands authenticate only this host profile; they do not register MCP or authorize wallet actions.

For either option, keep the worker profile pristine: no manual configuration, MCP registrations, apps or plugins. Only the pinned CLI’s generated `/workspace` trust entry and bundled `.system` skills are allowed. The root interactive Codex CLI uses its own normal profile and independent authentication. Check it with `CODEX_HOME="$HOME/.codex" codex login status`; For API-key login to the root profile, run `CODEX_HOME="$HOME/.codex" codex login --with-api-key < "$ACT_SETUP_DIR/openai-api-key"`; for ChatGPT login use `CODEX_HOME="$HOME/.codex" codex login`. Unlike the companion’s ephemeral authentication, interactive CLI login uses that profile’s configured credential store. Do not copy another profile’s auth files into the worker image or checkout.

Choose an exact model available to your account/API project, put it in `models` below, and run `check-codex` before binding an operator.

## 2. Create your root

Open [Setup](https://agent-capital-tree.vercel.app/setup), connect your wallet on **Ethereum Sepolia (chain 11155111)**, and select **Launch a new root vault** (or **Create another root** if another vault is already open). Choose a unique lowercase ENS label and a mandate that includes only the actions and token limits your operator needs; an expiry cannot exceed the project namespace expiry shown by the form. The owner wallet needs Sepolia ETH for creation, funding, and operator binding. Get official test USDC from the [Circle faucet](https://faucet.circle.com/), then use **Fund root** with your owner wallet. DEMO-USD is a separate valueless pool quote; use **Get DEMO-USD** for its one-time faucet claim only if you want to test liquidity positions. Use your own new root for agent tasks; **Open live demo** is someone else's existing tree and is for inspection.

The browser navigates by ENS name or vault contract address, but the local companion still needs the controller's numeric `rootId`. After creating your root, copy its **root** ENS name or vault address from the dashboard and open `https://agent-capital-tree.vercel.app/api/resolve-root?q=YOUR_ENS_NAME` (URL-encode your value). The JSON response has `rootId`, `nodeId`, `vault`, and `rootVault`; for a root, `rootId` and `nodeId` match. Copy **`rootId`** into the config below. This is an internal onchain controller index, not another wallet or contract. Read the current controller address from [`deployments/usdc-sepolia.json`](../deployments/usdc-sepolia.json); do not use archived deployment manifests.

## 3. Configure and prepare the operator

Outside the checkout, create a JSON config (mode `0600`) in the private directory from step 1. Keep the dedicated Codex home private and owned by your user:

```sh
install -d -m 700 "$ACT_SETUP_DIR"
(umask 077; touch "$ACT_SETUP_DIR/config.json")
chmod 600 "$ACT_SETUP_DIR/config.json"
${EDITOR:-vi} "$ACT_SETUP_DIR/config.json"

```

Use absolute paths for `codexBinary`, `codexHome`, and the CLI commands below. Set `codexBinary` to the same verified `ACT_CODEX_BINARY` used to build the image and run the worker app-server; do not use a `command -v codex` path that resolves to a wrapper. Do not put the OpenAI key, Codex home, operator key, or `root-session.token` in Git. Example config; replace every placeholder and make `runtimeRoot` a **new, persistent** private directory for this one root and controller:

```json
{
  "runtimeRoot": "/absolute/private/runtime",
  "rootId": "YOUR_NEW_ROOT_ID",
  "rpcUrl": "https://your-sepolia-rpc.example",
  "controller": "0xeB2041B486D66aB91140FFcF54B66513D8eC40c8",
  "inference": "codex",
  "codexBinary": "/absolute/path/to/linux-codex",
  "codexHome": "/absolute/private/codex-home",
  "openaiApiKeyFile": "/absolute/private/openai-api-key",
  "imageId": "sha256:YOUR_BUILT_IMAGE_ID",
  "models": ["gpt-6-luna"],
  "reasoningEffort": "high",
  "childGasWei": "0"
}

```

The example selects `gpt-6-luna` with `reasoningEffort: "high"` for every native worker. The optional `reasoningEffort` override currently accepts `high`; omit it to use the model default. API-key preflight uses OpenAI’s live model endpoint, because the pinned CLI’s built-in catalog can lag newly released models. ChatGPT mode still checks the CLI account catalog.

Check the configured authentication, every configured model and Docker before creating or binding the operator:

```sh
node packages/runtime/cli.mjs check-codex /absolute/private/config.json

```

This preflight checks account and model metadata (using the official OpenAI models endpoint in API-key mode); it does not make a model inference or a financial call. The companion also checks native availability before allocating capital. It does not establish inference quota or billing credit. API-key mode uses the private key file and ephemeral app-server authentication; ChatGPT mode uses the dedicated `codexHome` login. The Docker worker stays network isolated and receives only scoped finance tools; it does not receive the host's Codex credentials. Preserve `runtimeRoot`, including its encrypted key files and `keys/master.password`; losing either makes the bound operator key unavailable. Do not reuse that directory for another root or controller.

**Optional HomeBox CLIProxyAPI path:** set `"inference": "cliproxyapi"` instead of `"codex"`; remove `codexBinary`, `codexHome` and `openaiApiKeyFile`; add `"upstream": "http://your-cliproxyapi-host:8317/v1"` and `"providerTokenFile": "/absolute/private/provider-token"`. The provider token file contains only the raw CLIProxyAPI credential, is owned by your user, and has mode `0600`. The endpoint must support `/v1/responses`; use model names available there. Configure the root CLI's user-level custom provider separately if it should also use CLIProxyAPI. See [official custom provider configuration](https://learn.chatgpt.com/docs/config-file/config-advanced#custom-model-providers). This optional path is the HomeBox configuration, not a prerequisite for the native jury flow.

```sh
node packages/runtime/cli.mjs prepare-root /absolute/private/config.json

```

This prints the **public operator address**, not its key. In your root's Setup & control page, use **Bind operator** to authorize that address and set its mandate. Wait for the wallet transaction to confirm and verify the bound address in the live root before starting the companion. The **vault does not need ETH**: it holds USDC and DEMO-USD, while the external signer pays transaction gas. Fund the operator address with Sepolia ETH for its own transactions; depositing USDC into the vault does not pay gas. A child spawn on the current public deployment used about 3.56 million gas including its ENS registry and allocation, so estimate ETH from current gas prices and keep headroom. `childGasWei` is a separate optional ETH grant for each spawned child; zero gives no grant. Size it from current fees and the task, within the runtime cap described in the runtime guide. A read-only child task does not require child transaction gas; x402 settlement gas is normally paid by the service facilitator, while other child onchain writes need child ETH.

## 4. Start the companion

```sh
node packages/runtime/cli.mjs start /absolute/private/config.json

```

This starts with public-chain writes disabled. Keep this terminal running. It writes `mcp-ready.json` and `root-session.token` as owner-only `0600` files under the private runtime directory. Restarting rotates the token; do not copy it into a prompt, config file or command line.

## 5. Register MCP in Codex CLI

After building SDK, plugin and runtime, register the private launcher as a **separate full companion MCP**. The command and both arguments must be absolute Linux paths in the same WSL2 distribution that runs the companion. Use your actual checkout and private `runtimeRoot` from the config above. Do not register the keyless and full server together under different names in one chat.
Use this launcher with the current native OpenAI API-key worker configuration or ChatGPT login; it does not require CLIProxyAPI.

```toml
[mcp_servers.kanoki]
command = "node"
args = ["/your/linux/checkout/packages/runtime/mcp-stdio.mjs", "/your/private/runtimeRoot"]
tool_timeout_sec = 300

```

If Codex runs on Windows while the companion runs in WSL2, use `command = "wsl.exe"` and prepend `"--exec", "/absolute/linux/path/to/node"` to `args`; the default WSL distribution must be the one running the companion. Find that Node path with `wsl --exec sh -lc 'command -v node'` in PowerShell. A bare `node` after `wsl --exec` is **not reliable** when Node is installed via nvm: WSL does not load the interactive shell. The launcher validates the private directory/domain/chain, loads the current loopback origin and rotated token inside WSL2, then starts the existing bundled 17-tool MCP without printing either secret. If the companion is stopped, the launcher fails closed. Check registration with `codex mcp get kanoki --json` and restart the chat after changing modes.

See the [plugin guide](../packages/plugin/README.md) for the 17 tool schemas. The standalone plugin includes `bundle/visual-assets` (WASM and fonts) and always returns PNGs for tool responses, with Mermaid fallback for hosts that cannot display images. Keep the assets alongside `bundle/server.mjs`.
On Linux, restart the root Codex session after registering the launcher; it reads the current token from the private runtime directory. No token needs to be copied into the root Codex environment.

## 6. Read, then perform one controlled spawn

First ask: “Use Capital Tree MCP `getTree` with my numeric root ID and `getEffectivePolicy` for that root. Report the owner, operator, balances and allowed actions. Do not write transactions.”

For a write test, stop the companion with Ctrl-C and restart explicitly:

```sh
node packages/runtime/cli.mjs start /absolute/private/config.json --enable-sepolia-writes

```

Restart the Codex session; the launcher reads the current private token automatically. Ask it to use **our MCP `spawnChild`** with these arguments, replacing `operationKey` with a fresh `0x`-prefixed 32-byte hex value. The current manifest's USDC address is shown here; check it against the manifest when you run this. `10000` raw six-decimal units equals 0.01 USDC. The parent must have `delegate`, sufficient free USDC, and an active mandate.

```json
{
  "operationKey": "0xYOUR_64_HEX_CHARACTERS",
  "name": "researcher",
  "task": "Read your own vault and effective policy with Capital Tree MCP, then report the result. Do not send transactions.",
  "model": "YOUR_AVAILABLE_CODEX_MODEL",
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

> Use Capital Tree MCP to create one funded child worker named `jury-researcher`. Allocate exactly 10 official Sepolia test USDC (`10000000` raw units) from my root vault. Give it only `pay` and `swap`, allow official USDC and the configured valueless DEMO-USD pool token, cap any USDC payment or swap input at 0.01 USDC (`10000` raw units), and set an expiry within my root's current mandate. Have it inspect the configured x402 services and buy one approved research result for at most 0.01 USDC. Then make one exact-input USDC-to-DEMO-USD Uniswap swap with `amountIn: "10000"` and my approved `minAmountOut: "9000"` (0.009 DEMO-USD). Set the swap deadline within ten minutes of the fresh `getTree.source.timestamp`. If simulation fails, stop and report it; do not lower the minimum output automatically. Reconcile uncertain operations with their original keys before any retry.

The root must already have `delegate`, `pay` and `swap` as needed to pass the child rights, allow **both** pool tokens, permit at least **10 USDC per action** to allocate the child, hold 10 USDC of free balance, and remain active through the proposed child expiry. The child restrictions for this request must explicitly set `capabilities: ["pay", "swap"]`, `allowedAssets` to both addresses in the current manifest, `maxPerAction` for USDC to `"10000"` and DEMO-USD to `"0"`, and a future Unix `expiresAt` no later than the parent expiry. The zero DEMO-USD input limit still allows the requested USDC-to-DEMO-USD swap but prevents a reverse swap. The `spawnChild` allocation uses `asset` set to official USDC and `amount: "10000000"`; a task prompt alone cannot set these onchain limits. If the parent lacks any prerequisite, stop before the spawn and ask the owner to set an appropriate mandate or fund the vault. The example is not permission to broaden an existing mandate.

Configure an approved Sepolia x402 seller in `paymentServices` as described below. The worker should call `getPaymentServices` and use only its listed `serviceId` and price ceiling; `purchaseService.maxAmount` is `"10000"` for the 0.01-USDC purchase.

x402 settlement normally uses facilitator gas. A swap is a direct onchain transaction: set a bounded nonzero `childGasWei` in the private companion config and fund the parent operator with enough Sepolia ETH for spawn, gas grant and its own transactions. The child vault itself does not need ETH.

Reserve enough operator ETH for the maximum transaction cost (`estimatedGas × maxFeePerGas`) **plus** the child gas grant and any later spawn; an estimate of the eventual fee alone is insufficient. The jury run needed an additional 0.01 Sepolia ETH for its replacement spawn even though the previous spawn had left roughly 0.008 ETH. Recheck current gas prices instead of treating these test amounts as a fixed requirement.

For the swap, use `tokenIn` as USDC, `amountIn: "10000"`, the owner-approved `minAmountOut: "9000"`, and a `deadline` based on a fresh chain timestamp. This is a bounded demonstration, not a live market quote: the MCP has no quote tool, and an isolated worker has no general network access. The DEMO-USD output is valueless and is not a USD return.

The launched worker receives both controller token addresses and their decimals from the companion's onchain reads. It should use `getTree` for a fresh timestamp and vault state, `getPaymentServices` for configured sellers, then the scoped `purchaseService` and `swap` tools for the two actions. It cannot query a public RPC, explorer or website directly from its isolated container. The companion prepares the configured child gas grant before launch, but that does not prove the child's current ETH balance; the swap tool handles simulation and submission. On a gas or simulation error, stop and report it without changing the approved minimum output or starting another payment.

Record the spawn key and full arguments privately. If the spawn call times out or its result is unclear, check `getOperationStatus`, the current tree and the transaction receipt before taking another action. Retry only with the same key and arguments. `getOperationStatus` tracks `createChildVault` and `spawnChild` allocation/dispatch only; its `not_allocated` result says nothing about a payment or swap. Apply the purchase-specific nonce and merchant reconciliation below to uncertain x402 results, and inspect the receipt and vault state after an uncertain swap before another write. Verify the child's actual rights, vault allocation, payment and swap receipts in the dashboard and onchain; a native Codex subagent has none of this custody or authority.

`getOperationStatus.dispatchStatus: "started"` confirms worker launch, not task completion. A stopped or failed worker is not automatically replayed. Reconcile payment, swap, vault and receipt state before any supervised continuation; do not allocate a replacement child just to repeat an uncertain task.

## Success checks

- The live Setup & control page shows your root vault and the operator address printed by `prepare-root`; `start` accepts the same root/controller configuration.
- The root MCP `getTree` returns that root's current onchain balances and agent authority, with no preview balances. `getEffectivePolicy` shows the intended limits.
- The controlled `spawnChild` returns a confirmed child ID; the dashboard's Agent tree shows its ENS name, vault and allocation. Compare its transaction receipt with the live tree before issuing another operation.
- For the read-and-report example, the child can report its vault state. Its effective policy shows the zero USDC per-action limit and the narrowly scoped `delegate` capability; attempted capital movement beyond that limit must fail. A task's text alone does not grant rights.

For the two-application jury scenario, instead expect only PAY and swap rights, a 10000-raw-USDC per-action cap, and a 10000000-raw-USDC allocation. After one 0.01-USDC purchase and one 0.01-USDC swap, the child should hold 9.98 USDC plus the DEMO-USD output. Verify the payment receipt on x402 Pay and the swap receipt on Uniswap/Activity; Agent tree shows the actual remaining vault balances.

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

For a runnable controlled seller using your own Sepolia wallet, follow [Local x402 demo seller](x402-demo-seller.md). Its shared `scripts/lib/x402-demo-service.mjs` provides a loopback-only 0.01-USDC research endpoint, explicit payer allowlist, official facilitator integration and durable response caching. An interrupted ambiguous settlement fails closed and requires reconciliation instead of charging again. It is not a production merchant platform.
