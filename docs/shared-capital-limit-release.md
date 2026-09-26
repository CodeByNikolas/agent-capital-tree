# Shared capital limit and resumable Kanoki test

## Confirmed request

The user confirmed a **10 USDC limit shared by one root and all its children**, then explicitly raised the authorized new funding from 1 to **10 Test-USDC**. The planned child allocation is **0.02 USDC**. Existing capital reduces the requested funding; gas is separate. Network: Sepolia 11155111; token: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, six decimals.

The existing private setup was retained: `kanoki-5f526bf010c68992.agentcapitalvault.eth`, operator `0x2bfdaC1bC4EA1C52Ae3B7be40fC5d418282BAa5d`. The read-only MCP observed 0.01 ETH at that address and no root at block 11789219. The approved limit, funding and stable child operation are now saved locally, without a new key or transaction. The old unsigned 0.01-USDC amount is superseded by the user's explicit confirmation.

## Enforcement

`createRootWithCapitalLimit` stores the shared limit onchain, separately from `Policy.maxAmounts`. `fundRoot` checks both cumulative owner funding and aggregate USDC custody across all vaults. Internal delegation/reclaim does not consume a second funding allowance. Only the root owner can change `rootCapitalLimit`; a repeat setup cannot change it. A lower limit cannot be below already funded principal or current custody.

This first limited mode supports USDC delegation, restriction and reclaim only. Root operator changes cannot enable swaps, LP, payments, the second token or a pool in a limited tree. Those applications need separate capital accounting before they can safely operate under this limit. Existing unrestricted roots retain their existing semantics.

ERC-20 direct transfers cannot be prevented. If unsolicited USDC puts custody above the limit, delegation fails closed; restriction and owner recovery remain available. This is an enforced controller-managed capital boundary, not a claim that third parties cannot transfer tokens to an address.

## Setup and continuation

`prepareRootSetup` requires explicit user confirmation, positive uint256 raw limit and separate authorized funding; there is no demo maximum or default. It persists the original signer, a stable setup ID and an optional requested child test. Old unconfirmed setup records require explicit confirmation while retaining their key. The wallet page calls the limited creation entrypoint, verifies the exact onchain limit, guides every signature and persists step status and hashes. Funding uses the greater of current aggregate balance and cumulative funding so spending/restarting cannot silently refill the original target.

The host calls `continueCapitalSetup` repeatedly while the user signs. Each call waits at most 20 seconds for prerequisites, then executes the saved child request through the existing coordinator with the original operation key and current setup root. It verifies the receipt, parent/root relationship and actual balances, and returns the observed tree. The host must keep its task running; MCP cannot independently wake a closed/suspended chat. A vault-only test does not claim or launch an AI worker. Interrupted tasks retain their operation for resumption.

### Real autonomous workers — latest user clarification

The user explicitly requested real AI workers after initial wallet setup. The main MCP now exposes `getWorkerSetup` and `spawnChild` through the existing `RuntimeCompanion` and `NativeCodexLauncher`. A saved setup test containing `task` and `model` uses worker spawning; a vault-only test remains explicitly vault-only. The existing saved 0.02-USDC vault test is preserved; do not silently change its operation key or execution mode. A subsequently requested worker uses its own stable operation key, within the same shared capital limit.

The project operator provisions `~/.agent-capital-tree/worker-host.json` once on the Linux host, with mode 0600. It contains only pinned image/model settings, absolute `codexBinary` and dedicated `codexHome` paths, optional `openaiApiKeyFile`, optional `reasoningEffort: "high"`, and an explicit `childGasWei` string. It cannot override the session root, controller, signer or write authorization. Native Codex is the default; existing separately configured HomeBox proxy services remain untouched. Credentials must stay outside the repository and chat. See the existing worker setup below in `docs/local-setup.md` and [official App Server documentation](https://learn.chatgpt.com/docs/app-server).

Image existence and authentication/model access are checked before autonomous allocation. The child creation fee check also reserves the configured child gas grant. Only an actual successful launcher result produces `dispatchStatus: started`; an uncertain launch is not retried automatically. The main agent can repeat authorized spawning within current limits without an owner signature for each child. The MCP/runtime host must stay running to supervise workers. Fresh unprovisioned laptops are not claimed to support this automatically.

Local observation: Docker exists in WSL, but there is no worker-host configuration or dedicated worker Codex binary on PATH. A real worker launch therefore remains blocked on project provisioning, in addition to the new-controller deployment. No autonomous worker or inference request has been claimed as completed in this run.

The wallet's pending hashes are saved before receipt polling. Child hashes now survive runtime restart. Onchain operation keys prevent duplicate allocation even when a transport fails; an ambiguous wallet broadcast without a returned hash stays blocked rather than being blindly resubmitted. Wallet history is local to the browser; clearing that storage can lose intermediate UI history, although confirmed roots and funding are checked onchain.

## Deployment handoff — required before public E2E

The user assigned contract deployment, namespace attachment, Etherscan verification and web publication to the project responsible person. No deployer credential was present locally. The current immutable controller **does not** implement the new limit. New setup therefore returns `CAPITAL_LIMIT_UNSUPPORTED` and opens no funding link.

1. Deploy the reviewed artifacts with the existing `scripts/deploy-capital-system.mjs` and a separate staged manifest/private journal. Use a free authorized ENS namespace; never repoint the existing live namespace or migrate existing funds. Verify bytecode, namespace and explorer sources before promoting the manifest.
2. Before switching this machine's current deployment, preserve and reattach the pending setup's existing operator key and saved intent to the new deployment domain through a reviewed local migration. This release deliberately does not silently copy keys between controller domains. That migration remains an integration gate; preserve the already funded operator and never ask for its gas again merely because the controller changed.
3. Update the public manifest only after verification, rebuild SDK/plugin/runtime and web, and publish main to `kanoki-app.vercel.app`. Reconnect the installed MCP to load its new bundle.
4. Run the existing test runner with the confirmed values:

   `node scripts/test-capital-onboarding.mjs --limit-raw 10000000 --funding-raw 10000000 --child-raw 20000 --user-confirmed`

   `--prepare-only` persists the same intent without a browser or transaction. The normal runner opens the wallet, polls automatically and verifies the same child operation twice. The owner still signs wallet actions. It writes public receipt/balance evidence to `artifacts/ui/kanoki-onboarding-e2e.json` only after success.

## Evidence and remaining gates

- 39 contract tests passed with Foundry 1.8.3 / Solidity 0.8.26, including limit, donation guard, owner-only changes, idempotency and existing custody tests.
- 22 plugin tests passed. Focused Linux runtime tests cover no-default setup, gas-only diagnostics, signer persistence, mismatch/revocation, limit immutability and the saved continuation path.
- Web production build and typecheck passed. Guided wallet adapter tests and desktop/mobile browser checks passed with 10-USDC disclosure.
- Public gas-only state was read through the actual MCP. No onchain write was submitted in this implementation run. Signed public setup, new-controller namespace integration, receipt transfer across deployment domains, and the final 0.02-USDC child E2E are **open**, not passed.

The user-supplied successful gas transaction remains `0x3b8d346dd89f5f43ff6bd86243ce485f92103c3f7b3c5105ff79a26f1858767e`; it proves neither root creation nor USDC funding. No new transaction hash is invented for this release.
