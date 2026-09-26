# Runtime companion and isolated workers

[Step-by-step companion and MCP setup](../../docs/local-setup.md): checkout, worker image, root, operator, private configuration and first agent task.

The companion owns the child signer, worker session and Docker process. `SpawnCoordinator` reconciles the onchain operation before launching a child. In the default native path, it prepares a private worker directory at `<runtimeRoot>/workers/<workerId>/` with mode `0700` and a `0700` workspace owned by the container UID/GID. The child signer and Codex login stay on the host; the container receives neither credential. The optional CLIProxyAPI path also prepares a disposable `0400` or `0600` key file and a unique gateway socket under that directory. Decrypted keys and inference credentials stay outside this repository.

The default native Codex path runs an authenticated app-server on the host with a dedicated private `codexHome`. Its network-isolated Docker exec-server uses a single workspace bind. A host loopback WebSocket relay connects the two, and the host app-server forwards only this worker's dynamic finance tool calls to the companion with a scoped token. `WorkerSessions` binds those calls to the actual child context; handlers check current chain authority. In optional CLIProxyAPI mode, `startWorkerGateway` binds the worker's Unix socket and forwards both `POST /v1/responses` to the host inference broker and `POST /v1/tools/<name>` to the companion. The broker holds the provider credential and constrains model access.

Both launchers use a local `sha256:` image ID and run Docker without network or Docker socket access, with a read-only root, dropped capabilities, no new privileges, CPU/memory/PID caps and nonroot UID/GID. The native launcher mounts only the workspace; `workerDockerArgs` in CLIProxyAPI mode mounts the workspace, key and Unix socket. The image contains Node 22, pinned Codex 0.154.0, the bundled plugin server and loopback bridge for the optional proxy path. Native threads explicitly select the Docker execution environment and run turns with `externalSandbox`; Docker supplies the isolation boundary. The optional proxy path runs Codex with `danger-full-access` inside the hardened container. A host compromise is outside this isolation claim; onchain vault rules remain the limit on a compromised worker.

The configured `models` allowlist must contain a model available through the selected inference path. Native Codex login does not imply availability of the HomeBox CLIProxyAPI aliases `gpt-6-luna` and `gpt-6-sol`.

`NativeCodexLauncher` launches the default host app-server and isolated Docker exec-server. `DockerWorkerLauncher` handles the optional CLIProxyAPI gateway path. Both stop a same-name orphan after a companion restart, enforce a lifetime, revoke scoped grants on exit and expose `stop(workerId)` for revocation or reorgs. The companion owns worker files and must recheck chain state before relaunching an orphan; a repeated task can call tools again, so onchain operation idempotency remains required. Neither launcher creates signers or infers a worker's identity from a model argument.

Build the image locally after building the plugin bundle:

```sh
node packages/runtime/build-worker-image.mjs /absolute/path/to/linux-codex EXPECTED_SHA256
```

The operator supplies an absolute Linux Codex 0.154.0 binary and its independently verified SHA-256. The helper checks the hash, version, executable format, and Docker daemon architecture, then emits the local immutable image ID. Set `ACT_WORKER_IMAGE_ID` to that ID and run `node packages/runtime/test/worker.integration.mjs` for two live containers using only synthetic keys. The base image is pinned by digest in `Dockerfile.worker`; the Codex binary is pinned by the supplied hash and version. Rebuild and record the new local image ID after changing the bridge or plugin bundle.

Native financial end-to-end verification is pending a real Codex login. The deterministic `test:native-protocol` check uses the real pinned CLI and Docker with a local Responses fixture: shell execution, file patches, host-file isolation, scoped finance forwarding and expiry pass without inference credentials. Its test-only wrapper substitutes fixture provider metadata; it does not verify normal account authentication. Set `ACT_CODEX_BINARY` and `ACT_WORKER_IMAGE_ID` to run it. After building, an operator with an authenticated worker profile may run the optional real inference smoke:

```sh
ACT_NATIVE_CONFIG=/absolute/private/config.json node packages/runtime/test/native-live.integration.mjs
```

It makes a real Codex inference using synthetic task data, a read-only `getPaymentServices` call and a workspace proof; it makes no chain or financial writes. This smoke has not yet run with a real login here and does not establish financial end-to-end acceptance. The existing `model.integration.mjs` command is a HomeBox CLIProxyAPI-only acceptance check; it requires that optional config and its owner-only `0600` `providerTokenFile` and is restricted to the HomeBox endpoint.

## Local companion

`node packages/runtime/cli.mjs prepare-root /absolute/private-config.json` creates an encrypted root operator key in the private runtime directory and prints **only its public address**. The human owner then binds that address to the chosen root with a wallet transaction. `prepare-root` does not require the operator to be bound yet. The companion uses one root/controller/chain domain per runtime directory; it refuses to reuse that directory for another controller.

A private config file owned by the current user with mode `0600` has this shape:

```json
{
  "runtimeRoot": "/absolute/private/act-runtime",
  "rootId": "1",
  "rpcUrl": "https://your-sepolia-rpc.example",
  "controller": "0x0000000000000000000000000000000000000000",
  "inference": "codex",
  "codexBinary": "/absolute/path/to/linux-codex",
  "codexHome": "/absolute/private/codex-home",
  "imageId": "sha256:local-built-image-id",
  "models": ["YOUR_AVAILABLE_CODEX_MODEL"],
  "childGasWei": "0"
}
```

For native inference, `codexBinary` is the absolute path to the same verified Linux ELF used by `build-worker-image.mjs`, rather than a shell wrapper. `codexHome` is a dedicated private directory authenticated with `CODEX_HOME=/absolute/private/codex-home /absolute/path/to/linux-codex -c 'cli_auth_credentials_store="file"' login`; check it with `CODEX_HOME=/absolute/private/codex-home /absolute/path/to/linux-codex login status`. This worker login profile must remain pristine, without manual configuration, MCP registrations, apps or plugins. The pinned CLI’s generated `/workspace` trust entry and bundled `.system` skills are allowed. The root interactive CLI uses a separate profile with the root MCP registration; use its `/model` picker to copy an exact account-available name into `models`. Run `node packages/runtime/cli.mjs check-codex /absolute/private-config.json` before `prepare-root`: it checks login, the configured models and Docker without running inference or making financial calls. The companion checks native availability again before child allocation. Authentication stays with the host app-server. The root MCP bearer is separate from Codex authentication.

For **optional HomeBox CLIProxyAPI inference**, set `"inference": "cliproxyapi"`, remove `codexBinary` and `codexHome`, and add `"upstream": "http://your-cliproxyapi-host:8317/v1"` plus `"providerTokenFile": "/absolute/private/cliproxyapi-token"`. The upstream must be CLIProxyAPI; the worker never receives its credential. A present token file must be an absolute, owner-only `0600` regular file; invalid values fail closed. On HomeBox only, omitting the property uses the host-only `/usr/local/bin/codexops-proxy-token` helper. Start with `node packages/runtime/cli.mjs start /absolute/private-config.json`. It prints the local tools origin and private root MCP token path, and disables Sepolia writes by default. An explicit `--enable-sepolia-writes` flag is required for onchain worker actions. The CLI never prints the bearer.

`pnpm --filter @agent-capital-tree/runtime test:chain` includes Anvil-only CLI startup checks with synthetic credentials and disabled Sepolia writes. It checks that invalid explicit `providerTokenFile` values are rejected without helper fallback in CLIProxyAPI mode. This proves local configuration handling; it does not prove an independent machine or native financial execution.

Indexed `getCapitalActivity` is optional. To enable it, add `"multibaas": { "deploymentUrl": "https://your-deployment.multibaas.com/", "controllerLabel": "capital-controller", "apiKeyFile": "/absolute/private/multibaas-key" }` to the private config. The key file must contain only the raw API key, belong to the current user and have mode `0600`; the setup wizard’s `multibaas.env` is a separate environment file and must not be passed as this raw-key file. The companion binds activity requests to the worker's root and its configured controller, and the MultiBaas adapter verifies indexed values and finality against Sepolia RPC receipts. Without this config the tool returns unavailable; no synthetic history is returned.

Each child task has one durable dispatch attempt. A retry after a crash can reconcile a confirmed allocation without duplicating capital, but it will not replay an ambiguous or completed model task. A lost dispatch journal likewise leaves the task unrerun; use a new operation and key for new work. The durable child key and intent hash are bound to Sepolia, controller, root, parent, generation and operation key. Onchain parameters and child address must match. If the original child policy has since changed and the original parameters cannot be reconstructed, reconciliation fails closed. The companion stops orphan containers and removes their disposable key files on restart, then polls active onchain authority; stale generations, revoked roles or invalid paths revoke the worker's MCP/inference grants and stop Docker. Only one companion process may own a runtime directory.

`childGasWei` is zero by default. A nonzero base grant is capped at `0.025 Sepolia ETH` per root-created child; a grandchild receives one quarter of that base. The ETH comes from the parent operator and is sent once after the child allocation is confirmed. The companion writes the exact signed raw transaction and hash to a private `0600` journal before broadcast; a retry may only rebroadcast that same transaction. The gas fee ceiling is 20 gwei. The operator must size the grant against measured spawn gas and current fees; a configured grant does not guarantee another spawn is affordable. A missing or uncertain gas receipt prevents worker dispatch. There is no faucet or automatic refill. No live Sepolia spend was performed during runtime development; the Anvil integration uses only disposable accounts.
