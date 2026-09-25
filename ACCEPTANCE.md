# Acceptance evidence — Agent Capital Tree

Reviewed on 26 September 2026 (Europe/Berlin), against [PLAN.md](PLAN.md). **The full acceptance gate remains open.** ENSv2, Uniswap, isolated agent execution and owner recovery have real deployment evidence. Live MultiBaas indexing and a master decision based on that indexed history have not been demonstrated. No local or synthetic test substitutes for those two requirements.

## Deployment and versions

| Item | Recorded value |
| --- | --- |
| Public source | https://github.com/CodeByNikolas/agent-capital-tree |
| Published app | https://agent-capital-tree.vercel.app |
| Verified frontend deployment | `dpl_6j4wuuYQLmaBXY9Xxi4iMA1ustB7`; frontend change `3ffc06f` |
| Immutable frontend URL | https://agent-capital-tree-eojrpsb9x-tumblockchains-projects.vercel.app |
| Last fully observed CI before this audit's added probes | [`3474eed`](https://github.com/CodeByNikolas/agent-capital-tree/actions/runs/36196054191), TypeScript and Contracts jobs passed |
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
| 8. Reload website; state/history/receipts agree; exit independent of indexer | [browser-final-state.json](deployments/browser-final-state.json); [UI report](artifacts/ui/smoke-report.json) | State and canonical recovery receipts agree; all four Root5 vaults revoked and empty, no LP. Owner exit worked with MultiBaas unconfigured. **Real indexed history equivalence and live indexer outage remain unproven** |

Final owner recovery: [`0x2d4a57…4808c`](https://sepolia.etherscan.io/tx/0x2d4a57a8cfd6967e8ced4a7d177f63cfa55b3315766c6d741bfd3e2c5ee4808c). Seed1's NFT39811 and5000e18 liquidity remain intact. Roots2 and5 are retired: do not restart them or replay completed financial runners.

## Cross-cutting checks and work packages

| Requirement / work package | Evidence | Remaining boundary |
| --- | --- | --- |
| P0: repository, plan, CI | [CI](.github/workflows/ci.yml), PLAN/STATUS, public commit history | Individual coherent changes committed after relevant checks |
| P1: real integration gates | Deployment manifest, [Sepolia fork runner](scripts/test-sepolia-fork.mjs) | MultiBaas ABI/address registration and indexed query still open |
| P2/P3: native ENS EAC, constrained capital, custody, generation and exit | [Controller tests](contracts/test/CapitalController.t.sol), [Registry tests](contracts/test/ManagedRegistry.t.sol), [Owner exit test](contracts/test/CapitalOwnerExit.t.sol) |25 staged Forge tests including256 fuzz runs; live flows supplement rather than replace adversarial tests |
| P4: SDK / shared state | [SDK](packages/sdk), generated ABI check in CI, actual model runs and final-state check | Reads token amounts as integers; tree snapshot uses one block |
| P5: frontend / permissions | [UI report](artifacts/ui/smoke-report.json), [desktop](artifacts/ui/root5-current-desktop.png), [mobile](artifacts/ui/root5-current-mobile.png) |1440/390px; hierarchy/order, exact balance access, keyboard Tab/Enter selection with visible focus, invalid/missing roots and disconnected controls tested |
| P6: isolated workers and model access | [worker integration](packages/runtime/test/worker.integration.mjs), [model integration](packages/runtime/test/model.integration.mjs), live model receipts | Separate private keys/workspaces, networkless worker containers, no Docker socket or provider master credential in worker. Host compromise is outside this claim |
| P7: plugin package/install | [Plugin](packages/plugin), fresh root/model report | [Fresh native install/read proof](deployments/plugin-install-e2e.json) passed on Codex0.154.0; [runner](scripts/test-plugin-install.mjs). Installed plugin retains the default60s timeout; financial writes use the documented direct MCP path |
| P8/P9: bounded swaps and LP lifecycle | [Swap tests](contracts/test/CapitalSwap.t.sol), [Liquidity tests](contracts/test/CapitalLiquidity.t.sol), real LP receipts | Custody, caller/callback/slippage checks and owner closure after invalid ENS path covered |
| P10: indexed activity and canonical verification | [MultiBaas adapter/tests](packages/multibaas), server-only activity route |9 adapter tests /13 event types; **live indexing is not configured** |
| P11: independent jury setup | [Runtime configuration](packages/runtime/README.md), fresh wallet/profile flow | Caller-supplied `providerTokenFile` exists; a portable execution proof is being checked. Same-host testing must not imply independent external-user/machine acceptance |
| P12: combined acceptance and failure modes | Reports above; [browser-negative-cases.json](deployments/browser-negative-cases.json); runtime journal/server tests | Actual reject/network switch, injected tree-API outage, restart/idempotency and recovered final state. Combined live MultiBaas/master-history gate remains open |
| P13: publication and submission artifacts | Public repository, Vercel and Sepolia; [FEEDBACK.md](FEEDBACK.md), source links in README | Feedback form and ETHGlobal submission have not been sent; no team/contact details or success confirmation invented |

The master has **programmatically** reclaimed Child6 capital and reallocated0.5 ACT-A to Sibling8, as recorded in the follow-up report. That is not proof of a model reading indexed history and choosing a reallocation. A new active test root and live MultiBaas access are needed for that remaining path.

## Reproduce without spending test funds

```sh
pnpm build
pnpm typecheck
pnpm test
bash contracts/scripts/test-contracts.sh
ACT_TEST_APP_URL=https://agent-capital-tree.vercel.app node scripts/test-web-smoke.mjs
node scripts/test-sepolia-negative-calls.mjs
```

The last command needs historical Sepolia RPC access, not a wallet. Do not rerun setup/spawn/funding/recovery scripts on completed public roots just to refresh a report. Their journals and receipts are deliberate safeguards against duplicate spending.

## Required external input

The local MultiBaas credential file is absent and the published `/api/activity?root=5` currently returns `source: unavailable`, `reason: not_configured`. Run [configure-multibaas.sh](scripts/configure-multibaas.sh) interactively on the host to store a restricted DApp User key outside the repository. Administrative ABI/address linking and historical indexing from11781260 are separate requirements. Then configure the server-only Vercel key/label and execute the real history/UI/MCP/master-decision tests. Credentials must never be pasted into chat or committed.
