# Runtime foundation

This package supplies the local companion's trust boundary. It does not start containers or sign transactions by itself.

- `WorkerSessions` issues opaque MCP bearer tokens and binds them to a companion-owned `WorkerContext`. MCP write handlers use `authorizedWorkerCall`; tool arguments, including `agentId`, never select the signer or node.
- `SpawnCoordinator` uses `(rootId, parentId, authorityGeneration, operationKey)` as its local retry scope. The SDK-backed `SpawnChain` adapter must submit the contract's atomic spawn and reconcile that exact operation against chain state, including ambiguous sends and reorgs. `WorkerLauncher` must be idempotent by child ID. The file journal is local, stores no secrets or task text, and is not a replacement for contract idempotency.
- `workerDockerArgs` checks real mount paths under `<runtimeRoot>/workers/<workerId>/` and constructs fixed Docker arguments. The caller creates a private workspace, a disposable decrypted key file readable by container UID 10001, and an **internal** `act-workers` Docker network with access to the broker and required RPC only. The image is pinned by SHA-256 digest. Feed the task on stdin; never insert it into Docker args or env. Start Docker using an argument array, with no shell.
- `InferenceBroker` is the only model route. Configure `upstream` as the companion's CLIProxyAPI `/v1` endpoint and `upstreamKey` from a host-only secret source at process startup; never mount either in a worker. It accepts only `/v1/responses`, fixes the model per token, and enforces expiry, call count, and request size. The worker gets only its own short-lived `ACT_INFERENCE_TOKEN`.

Synthetic configuration shape (values are placeholders):

```ts
const broker = new InferenceBroker({
  upstream: 'http://127.0.0.1:8317/v1',
  upstreamKey: hostOnlySecret,
  maxBodyBytes: 1_000_000,
});
const token = broker.issue('approved-model', 15 * 60_000, 100);
```

The generated Codex invocation selects a custom `local_broker` provider with `ACT_INFERENCE_TOKEN`, `--json`, and stdin prompt. This follows the [official CLI reference](https://developers.openai.com/codex/developer-commands?surface=cli#cli-codex-exec) and [configuration reference](https://developers.openai.com/codex/config-reference/). A real CLIProxyAPI model call, two live containers, key isolation, Docker network policy, and SDK integration remain required before P6 can be accepted.
