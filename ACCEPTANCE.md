# Acceptance evidence — Agent Capital Tree

Reviewed on 26 September 2026 (Europe/Berlin), against [PLAN.md](PLAN.md). **The full acceptance gate remains open.** ENSv2, Uniswap, isolated agent execution and owner recovery have real deployment evidence. Live MultiBaas indexing and an actual Sol master task based on verified history are now demonstrated on Root9, including full owner recovery. Independent external-user onboarding and the specifically listed failure-mode boundaries remain open.

## Deployment and versions

| Item | Recorded value |
| --- | --- |
| Public source | https://github.com/CodeByNikolas/agent-capital-tree |
| Published app | https://agent-capital-tree.vercel.app |
| Verified frontend deployment | `dpl_CecwmDyVPjRKMLYcUGkMTGie4Js2`; product source `b505621` |
| Immutable frontend URL | https://agent-capital-tree-ceds85iya-tumblockchains-projects.vercel.app |
| Last fully observed source CI | [`b505621`](https://github.com/CodeByNikolas/agent-capital-tree/actions/runs/36224369865), TypeScript and Contracts jobs passed |
| Chain | Ethereum Sepolia, `11155111` |
| Controller | `0x55caFFf719B5FA70c0e8942eEe2C7EE6B8c7Db6b`, deployment block `11781260` |
| ENS namespace / registry | `agentcapitaltree.eth` / `0x72D923aaBc7b1deD019A25577C46D6Fb1Ff67Fb3` |
| Factory/token/protocol addresses and deployment receipts | [sepolia.json](deployments/sepolia.json) |
| ENSv2 source | `48b3e2d39513b9dd32ef1850877a29009bc807b9` |
| Uniswap v4 core / periphery | `46c6834698c48bc4a463a86d8420f4eb1d7f3b75` / `9969eec44cfdf07e24b41de47f40276a58401976` |
| Toolchain | Node22, pnpm11.13.1, Next16.3.6, Foundry1.8.3, Codex0.154.0, MetaMask13.49.0 |
| Tested worker image | `sha256:e18863655ebc0b6daf3b4ebb87851d1ffc8504db7c497bc0252fa9d07ca874b0` |
| Worker Codex SHA256 | `9b7c1c7abdc26fc3c4f47c77656a8e9121def5483dbae830ef1ee561758448a9` |
| Models / inference | Root Sol Medium, children Luna Max; HomeBox CLIProxyAPI only |

The latest documentation/test commit need not be the frontend deployment's build commit. Financial reports below preserve their actual chain blocks and transaction hashes. [STATUS.md](STATUS.md) records subsequent work without changing the original evidence.

## Required public-app sequence

| PLAN step | Actual evidence | Scope and limits |
| --- | --- | --- |
| 1. Fresh owner wallet, root creation, token claims/funding | [browser-owner-e2e.json](deployments/browser-owner-e2e.json) | Real published app and MetaMask; seven confirmed transactions, separate operator |
| 2. Fresh Codex profile, plugin/runtime, wallet operator binding | Owner report; [root-codex-e2e.json](deployments/root-codex-e2e.json); [plugin instructions](packages/plugin/README.md) | Fresh model profile and real bundled MCP execution passed. A separate [native installation/read test](deployments/plugin-install-e2e.json) passed with the installed cache bundle. Marketplace financial writes remain untested; direct MCP registration with an explicit timeout is the tested long-write path |
| 3. Root delegates to child and grandchild with narrower mandates | Root Codex report; [runtime-e2e.json](deployments/runtime-e2e.json) | Actual model/tool calls and canonical allocations. Child and grandchild use distinct isolated keys |
| 4. Swap, open/increase LP, generate and collect nonzero fees | Root Codex report | Real v4 contracts, NFT39834; controlled intervening swap before fee collection |
| 5. Deny excess amount, unsupported asset, rights expansion | [sepolia-negative-calls.json](deployments/sepolia-negative-calls.json); [runner](scripts/test-sepolia-negative-calls.mjs); contract tests | Direct historical `eth_call` at canonical block11781852, with successful authority controls. Exact contract revert selectors verified. No state overrides, signer or broadcast; unsupported third asset is distinct from a single-token child mandate. This does not claim mined negative transactions |
| 6. Revoke branch; sibling stays usable | [browser-tree-followup.json](deployments/browser-tree-followup.json) | Child6/Grandchild7 direct checks return `Inactive()`; existing Sibling8's real Luna swap confirms after revoke block. Restart/repeated spawn does not duplicate allocation, gas or dispatch |
| 7. Stop runtime; owner exits LP and recovers remaining assets | [browser-owner-close.json](deployments/browser-owner-close.json); [browser-owner-recovery.json](deployments/browser-owner-recovery.json) | Real MetaMask signatures through published UI. Ambiguous attempt reconciled before resuming only the missing step. Final fresh wallet profile required [onboarding restart](deployments/browser-recovery-profile.json), not a flawless one-command wallet provisioning run |
| 8. Reload website; state/history/receipts agree; exit independent of indexer | [browser-final-state.json](deployments/browser-final-state.json); [UI report](artifacts/ui/smoke-report.json) | State and canonical recovery receipts agree; all four Root5 vaults revoked and empty, no LP. Owner exit worked with MultiBaas unconfigured. Root9 adds actual indexed history equivalence and owner recovery; an intentionally induced live provider outage remains unproven |

Final owner recovery: [`0x2d4a57…4808c`](https://sepolia.etherscan.io/tx/0x2d4a57a8cfd6967e8ced4a7d177f63cfa55b3315766c6d741bfd3e2c5ee4808c). Seed1's NFT39811 and5000e18 liquidity remain intact. Roots2 and5 are retired: do not restart them or replay completed financial runners.

## Cross-cutting checks and work packages

| Requirement / work package | Evidence | Remaining boundary |
| --- | --- | --- |
| P0: repository, plan, CI | [CI](.github/workflows/ci.yml), PLAN/STATUS, public commit history | Individual coherent changes committed after relevant checks |
| P1: real integration gates | Deployment manifest, [Sepolia fork runner](scripts/test-sepolia-fork.mjs) | MultiBaas ABI/address linking and positive query/receipt verification passed from block11783944 |
| P2/P3: native ENS EAC, constrained capital, custody, generation and exit | [Controller tests](contracts/test/CapitalController.t.sol), [Registry tests](contracts/test/ManagedRegistry.t.sol), [Owner exit test](contracts/test/CapitalOwnerExit.t.sol) |25 staged Forge tests including256 fuzz runs; live flows supplement rather than replace adversarial tests |
| P4: SDK / shared state | [SDK](packages/sdk), generated ABI check in CI, actual model runs and final-state check | Reads token amounts as integers; tree snapshot uses one block |
| P5: frontend / permissions | [UI report](artifacts/ui/smoke-report.json), [desktop](artifacts/ui/root5-current-desktop.png), [mobile](artifacts/ui/root5-current-mobile.png) |Five routes ×1440/390px ×light/dark; sidebar/query navigation, tree geometry,14px minimum rendered text and contrast, keyboard detail Sheet/focus return, mobile amounts/receipts, invalid roots and disconnected controls tested |
| P6: isolated workers and model access | [worker integration](packages/runtime/test/worker.integration.mjs), [model integration](packages/runtime/test/model.integration.mjs), live model receipts | Separate private keys/workspaces, networkless worker containers, no Docker socket or provider master credential in worker. Host compromise is outside this claim |
| P7: plugin package/install | [Plugin](packages/plugin), fresh root/model report | [Fresh native install/read proof](deployments/plugin-install-e2e.json) passed on Codex0.154.0; [runner](scripts/test-plugin-install.mjs). Installed plugin retains the default60s timeout; financial writes use the documented direct MCP path |
| P8/P9: bounded swaps and LP lifecycle | [Swap tests](contracts/test/CapitalSwap.t.sol), [Liquidity tests](contracts/test/CapitalLiquidity.t.sol), real LP receipts | Custody, caller/callback/slippage checks and owner closure after invalid ENS path covered |
| P10: indexed activity and canonical verification | [MultiBaas adapter/tests](packages/multibaas), server-only activity route |11 adapter tests /13 event types; actual Root9 setup and model writes indexed and canonically verified; free-plan boundary and lagging status checkpoint disclosed |
| P11: independent jury setup | [Runtime configuration](packages/runtime/README.md), fresh wallet/profile flow | [Supplied-file acceptance](deployments/provider-file-acceptance.json) passed: local CLI startup, eight invalid-file cases with zero helper calls, and actual isolated model/MCP read using a supplied file. Trusted outer setup used the existing host credential. Independent external-user/machine acceptance remains unproven |
| P12: combined acceptance and failure modes | Reports above; [browser-negative-cases.json](deployments/browser-negative-cases.json); runtime journal/server tests | Actual reject/network switch, injected tree-API outage, restart/idempotency and recovered final state. Root9 live MultiBaas/master-history and final recovery passed; evidence below |
| P13: publication and submission artifacts | Public repository, Vercel and Sepolia; [FEEDBACK.md](FEEDBACK.md), source links in README | Feedback form and ETHGlobal submission have not been sent; no team/contact details or success confirmation invented |

The [Root9 master report](deployments/multibaas-master.json) records a real Sol Medium sequence: getCapitalActivity → getTree → reclaimAssets → getTree → allocateCapital. It reclaimed1ACT-A from Child10 and reallocated0.5ACT-A to Sibling11 after checking positive receipt-verified history, current balances, no LP and actual authority. The [final state](deployments/multibaas-master-final-state.json) independently verifies all three vaults revoked and empty,4ACT-A returned to the owner, and the seed LP preserved. This was a directed conditional task, not autonomous strategy discovery.

The [local Sepolia-fork rehearsal](deployments/multibaas-master-fork.json) passed before the new public flow. API-format errors and a read-only model refusal were reconciled before continuation. A transient post-model indexer read timeout did not cause a model replay: the [finalizer](scripts/test-multibaas-master-finalize.mjs) verified both existing transactions and performed only the remaining owner recovery. Private original reports/transcripts are retained; public reports contain hashes and sanitized evidence. Root9 is now retired as well; no completed financial runner should be replayed.

The redesigned five-page dashboard preserves the live APIs and wallet action layer. [Additional UI guardrails](artifacts/ui/guardrails-report.json) use a keyless EIP-1193 stub to check owner/account/network gating, stale-state blocking and an injected history outage. They send no transactions and do not replace the historical real MetaMask evidence. Wallet setup now compares the actual injected account with the expected address before recording readiness; helper regression checks passed, but fresh real wallet provisioning was not repeated.

## Reproduce without spending test funds

```sh
pnpm build
pnpm typecheck
pnpm test
bash contracts/scripts/test-contracts.sh
ACT_TEST_APP_URL=https://agent-capital-tree.vercel.app node scripts/test-web-smoke.mjs
ACT_TEST_APP_URL=https://agent-capital-tree.vercel.app node scripts/test-web-guardrails.mjs
node scripts/test-sepolia-negative-calls.mjs
```

The last command needs historical Sepolia RPC access, not a wallet. Do not rerun setup/spawn/funding/recovery scripts on completed public roots just to refresh a report. Their journals and receipts are deliberate safeguards against duplicate spending.

## Required external input

MultiBaas is configured with a server-only runtime key, and Sepolia funding has been received. No additional key or paid plan is needed for the completed Root9 proof. Historical Root5 backfill exceeds the free plan’s100-block allowance and is explicitly excluded from complete history claims. Independent external-user installation still needs a genuinely separate user/environment with its own CLIProxyAPI access; existing same-host tests do not establish that. Team/contact details and explicit authorization to send the sponsor form/ETHGlobal submission remain absent.
