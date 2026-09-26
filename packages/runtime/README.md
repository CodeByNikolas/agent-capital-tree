# Runtime companion and isolated workers

The companion owns the child signer, worker session, inference grant, and Docker process. `SpawnCoordinator` reconciles the onchain operation before launching a child. The trusted caller must prepare a private worker directory at `<runtimeRoot>/workers/<workerId>/` with mode `0700`, a `0700` workspace, a disposable `0400` or `0600` key file, and a unique gateway socket path. The files must belong to the UID/GID that runs the container. Decrypted keys and provider credentials stay outside this repository.

`startWorkerGateway` binds that socket and replaces all incoming authorization headers with the worker's own broker or MCP token. It accepts only `POST /v1/responses` and `POST /v1/tools/<name>` and forwards to host loopback `InferenceBroker` and `companionServer` origins. `InferenceBroker` keeps the CLIProxyAPI provider key in host memory and enforces one fixed model, expiry, request size and call budget. `WorkerSessions` binds MCP calls to the actual child context; handlers check current chain authority. The worker receives neither bearer token nor provider key.

`workerDockerArgs` verifies the private files and generates a fixed `docker run` invocation: `--network none`, read-only root, dropped capabilities, no new privileges, CPU/memory/PID caps, nonroot UID/GID, and exactly three binds for its workspace, key and Unix socket. It accepts only a local `sha256:` image ID. The image contains Node 22, pinned Codex 0.154.0, the bundled plugin server and a small loopback socket bridge. Codex uses the broker as its only inference provider and runs with its own fresh disposable home. The Codex process uses `danger-full-access` *inside* the hardened container because nested Linux sandboxing is not required for this boundary. The container has no host network or Docker socket. A host compromise is outside this isolation claim; onchain vault rules remain the limit on a compromised worker.

The bridge accepts only `gpt-6-luna` at `max` reasoning or `gpt-6-sol` at `medium` reasoning and records the choice in the worker's private Codex profile.

`DockerWorkerLauncher.launch({ files, gateway, task, maxLifetimeMs, revoke })` starts a worker, sends its task over stdin, and returns when Docker reports it running. It stops a same-name orphan left after a companion restart, enforces a lifetime, then closes the gateway and calls `revoke` for the caller's scoped grants. `stop(workerId)` is the explicit revocation/reorg stop path. The caller owns creation and deletion of key/workspace files and must recheck chain state before relaunching an orphan; a repeated task can call tools again, so onchain operation idempotency remains required. The launcher does not create signers or infer a worker's identity from a model argument.

Build the image locally after building the plugin bundle:

```sh
node packages/runtime/build-worker-image.mjs /absolute/path/to/codex EXPECTED_SHA256
```

The operator supplies an absolute Linux Codex 0.154.0 binary and its independently verified SHA-256. The helper checks the hash, version, executable format, and Docker daemon architecture, then emits the local immutable image ID. Set `ACT_WORKER_IMAGE_ID` to that ID and run `node packages/runtime/test/worker.integration.mjs` for two live containers using only synthetic keys. `node packages/runtime/test/model.integration.mjs` reads the same private config and `providerTokenFile` described below, then checks a real HomeBox CLIProxyAPI model/MCP read. It never calls the host token helper; credentials stay in the owner-only files and the test reports only status markers. Both tests use ephemeral workers and synthetic task data. The base image is pinned by digest in `Dockerfile.worker`; the Codex binary is pinned by the supplied hash and version. Rebuild and record the new local image ID after changing the bridge or plugin bundle.

Run the model acceptance with `ACT_RUNTIME_CONFIG=/absolute/private-config.json ACT_WORKER_IMAGE_ID=sha256:... node packages/runtime/test/model.integration.mjs`. The runtime config and its `providerTokenFile` must both be owned by the current user with mode `0600`. The model test is deliberately restricted to HomeBox CLIProxyAPI at `http://100.91.160.81:8317/v1`.

## Local companion

`node packages/runtime/cli.mjs prepare-root /absolute/private-config.json` creates an encrypted root operator key in the private runtime directory and prints **only its public address**. The human owner then binds that address to the chosen root with a wallet transaction. `prepare-root` does not require the operator to be bound yet. The companion uses one root/controller/chain domain per runtime directory; it refuses to reuse that directory for another controller.

A private config file owned by the current user with mode `0600` has this shape:

```json
{
  "runtimeRoot": "/absolute/private/act-runtime",
  "rootId": "1",
  "rpcUrl": "https://your-sepolia-rpc.example",
  "controller": "0x0000000000000000000000000000000000000000",
  "upstream": "http://your-cliproxyapi-host:8317/v1",
  "providerTokenFile": "/absolute/private/cliproxyapi-token",
  "imageId": "sha256:local-built-image-id",
  "models": ["gpt-6-luna", "gpt-6-sol"],
  "childGasWei": "0"
}
```

`providerTokenFile` is optional only when the property is omitted on HomeBox, where the CLI reads the host-only `/usr/local/bin/codexops-proxy-token` helper into memory. If the property is present, its absolute path must name an owner-only `0600` regular file; an empty, invalid, or unreadable value fails closed instead of falling back. This is the portable setup for another machine with its own CLIProxyAPI endpoint, credential, and model. The upstream must be CLIProxyAPI; the worker never receives this credential. Start with `node packages/runtime/cli.mjs start /absolute/private-config.json`. It binds the tool and inference servers to `127.0.0.1`, prints their local origin and the path of a private root MCP token file, and disables Sepolia writes by default. An explicit `--enable-sepolia-writes` flag is required for onchain worker actions; do not use it until deployment details and balances are verified. The root Codex profile uses the printed local origin and reads its bearer from that private file during trusted local setup; the CLI never prints the bearer.

`pnpm --filter @agent-capital-tree/runtime test:chain` includes an Anvil-only CLI startup check using a synthetic `0600` provider token file and disabled Sepolia writes. It also checks that a missing, empty, null, or invalid explicit `providerTokenFile` is rejected without helper fallback. This proves local CLI configuration handling; it does not prove an independent machine or user's CLIProxyAPI account.

Indexed `getCapitalActivity` is optional. To enable it, add `"multibaas": { "deploymentUrl": "https://your-deployment.multibaas.com/", "controllerLabel": "capital-controller", "apiKeyFile": "/absolute/private/multibaas-key" }` to the private config. The key file must contain only the raw API key, belong to the current user and have mode `0600`; the setup wizard’s `multibaas.env` is a separate environment file and must not be passed as this raw-key file. The companion binds activity requests to the worker's root and its configured controller, and the MultiBaas adapter verifies indexed values and finality against Sepolia RPC receipts. Without this config the tool returns unavailable; no synthetic history is returned.

Each child task has one durable dispatch attempt. A retry after a crash can reconcile a confirmed allocation without duplicating capital, but it will not replay an ambiguous or completed model task. A lost dispatch journal likewise leaves the task unrerun; use a new operation and key for new work. The durable child key and intent hash are bound to Sepolia, controller, root, parent, generation and operation key. Onchain parameters and child address must match. If the original child policy has since changed and the original parameters cannot be reconstructed, reconciliation fails closed. The companion stops orphan containers and removes their disposable key files on restart, then polls active onchain authority; stale generations, revoked roles or invalid paths revoke the worker's MCP/inference grants and stop Docker. Only one companion process may own a runtime directory.

`childGasWei` is zero by default. A nonzero base grant is capped at `0.025 Sepolia ETH` per root-created child; a grandchild receives one quarter of that base. The ETH comes from the parent operator and is sent once after the child allocation is confirmed. The companion writes the exact signed raw transaction and hash to a private `0600` journal before broadcast; a retry may only rebroadcast that same transaction. The gas fee ceiling is 20 gwei. The operator must size the grant against measured spawn gas and current fees; a configured grant does not guarantee another spawn is affordable. A missing or uncertain gas receipt prevents worker dispatch. There is no faucet or automatic refill. No live Sepolia spend was performed during runtime development; the Anvil integration uses only disposable accounts.
