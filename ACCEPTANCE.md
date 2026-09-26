# Acceptance evidence — Agent Capital Tree

## Real native OpenAI API-key financial flow — 26 September 2026

**Passed:** real `gpt-6-luna` / `high` inference through the official OpenAI API, native Codex and isolated Docker execution. A fresh root Codex profile chose MCP spawn with 10 Sepolia test USDC; child 7 then autonomously paid 0.01 USDC through x402 and swapped 0.01 USDC through Uniswap. Its final balances were 9.98 USDC and 0.009965 valueless DEMO-USD. Canonical receipts, exact parameters, separate custody, narrower rights and over-limit rejection passed. No model-response fixture or inference proxy was used.

- [API authentication, model response and worker smoke](deployments/openai-api-check.json).
- [Funded spawn, payment, swap and policy evidence](deployments/jury-openai-native.json).
- The live test found and fixed a stale CLI model-catalog rejection; API-key mode now trusts the official API model-access check. Runtime build and all 26 runtime tests passed.

Scope: same Linux host and existing root/operator, fresh root CLI profile, controlled local merchant with real Circle settlement, testnet assets. Independent-machine onboarding, ChatGPT-login financial E2E, desktop, Claude Code and marketplace financial writes remain open. Earlier statements below record the state before this live run.

- All eight public dashboard checks passed at 1440px/light and 390px/dark: tree balances, spawn/payment/swap receipt links, payment name containment, no page errors and no horizontal overflow. [Browser evidence](artifacts/ui/jury-openai-dashboard-report.json).

## OpenAI API-key setup — 26 September 2026

At that earlier protocol-test stage, the preferred local setup added `openaiApiKeyFile` with ephemeral host app-server authentication. ChatGPT login remains an alternative. All 26 runtime tests passed, and the real pinned Codex/Docker protocol fixture passed in both authentication modes. The API-key mode uses a synthetic credential and simulated Responses output; it verifies routing, credential isolation, no auth.json persistence and expiry, not real API authentication or inference. **The real API-key inference and native financial E2E were subsequently completed above.** API billing is separate from onchain allowances.

## Native Codex runtime — 26 September 2026

The initial native setup used a dedicated normal Codex login without CLIProxyAPI. [Protocol evidence](deployments/native-codex-protocol.json) records a deterministic local Responses fixture driving the real pinned Codex app-server and Docker exec-server: scoped finance reads, isolated shell/file execution, host-file protection and expiry passed. The test-only executable substitutes fixture provider metadata; no real inference credential was used. All 24 runtime and seven plugin tests passed, and a fresh same-host installation passed the full build.

**Normal-account inference and native financial E2E remain open.** The real-login smoke is implemented and awaits a separate Codex authentication. The earlier x402/swap receipts below prove the proxy-based financial flow and are not native-login evidence. Independent-machine, Codex desktop and Claude Code acceptance also remain open.

## Current clone/USDC jury flow — 26 September 2026

Current controller: `0x7eDFa3D484d64b6bA3b5b2bcef51147E57133FFB`, namespace `agentcapitalvault.eth`. The [local setup guide](docs/local-setup.md) was exercised with two fresh local clones, a real MetaMask owner flow on the public dashboard, and a fresh Codex CLI profile through CLIProxyAPI.

- [Owner setup](deployments/usdc-jury-owner.json): root 4 created, funded with 10 test USDC and bound to its separate runtime operator.
- [Model/chain flow](deployments/jury-usdc-codex.json): GPT-6 Sol Medium selected funded MCP spawning; isolated child 6 paid 0.01 USDC using x402 and swapped 0.01 USDC using Uniswap v4. Remaining vault balances: 9.98 USDC and 0.009968 valueless DEMO-USD. Its 0.01-USDC action limit was independently checked, including an over-limit rejection.
- The first child failed at network preflight before spending. The runtime context was repaired; expiry prevented its continuation, owner recovery returned its 10 USDC, and a replacement was launched. An insufficient maximum gas reserve required a top-up and exact-key retry. The successful result does not describe an uninterrupted first attempt.
- [Public browser report](artifacts/ui/jury-dashboard-report.json): all eight desktop/mobile checks passed on the new tree, including exact spawn/payment/swap links and long ENS names contained within payment cells. The layout correction is live from source `18260a8`, production deployment `dpl_DMuNfp4xtJUgCafddnFxXFUdVEZW`; both CI jobs passed.
- [Current contract verification](deployments/usdc-sepolia.json) includes all six nodes and their EIP-1167 associations. Runtime tests/build/typecheck and plugin tests pass; see [STATUS.md](STATUS.md) for publication and dashboard checks.

**Independent external-user onboarding remains open.** This was a fresh installation/profile on the same Linux host, with a controlled loopback seller and Sepolia test funds. That recorded run used CLIProxyAPI; Codex desktop, native-login financial and Claude Code flows are not proven. Existing historical LP evidence below is not a repeated LP acceptance run.

## Historical first USDC release — 26 September 2026

The six-page follow-up is live at `https://agent-capital-tree.vercel.app` from Vercel deployment `dpl_ESRyCh5768tpUtLwQKaWaykSkrz8`. Public read-only browser checks covered all six routes on desktop/light and mobile/dark, including the verified Uniswap position event and the one 0.01 Test-USDC payment receipt. [Current UI report](artifacts/ui/usdc-ui-report.json). The Payment API scans a bounded Circle USDC log range and marks incomplete coverage; it is separate from MultiBaas controller history. No new wallet write or full current-USDC onboarding was performed.

At that stage the product used controller `0x17a932987f3cAcFec067c4C1bbE6946963d87F13`, namespace `agentcapitalusdc.eth`. The current clone deployment above supersedes these addresses; these are historical reports, not supported legacy entry points.

- 37 contract tests passed across8 suites, including256 fuzz runs;18 runtime plus an added payment-expiry test,11 MultiBaas,7 plugin and2 SDK tests passed.
- Actual Circle proxy / x402 protocol, inherited restrictions, revocation, LP lifecycle and recovery passed on a local fork: [report](deployments/usdc-x402-fork.json).
- Public seed:2 Test-USDC +2 valueless DEMO-USD; vault-owned Uniswap NFT39858. PAY-only researcher allocated0.25USDC, paid0.01USDC and retains0.24USDC; repeated request did not double-charge: [payment proof](deployments/usdc-payment.json). Controlled loopback merchant, no independent commercial merchant or autonomous model purchase claimed.
- Seven capital/strategy events retrieved from MultiBaas and verified against canonical receipts: [history proof](deployments/usdc-multibaas.json). Direct USDC payment events are outside this controller index.
- Two isolated live-worker checks passed with image `sha256:4904e2fcc68d25374fffb15e933f4638719748562fac4156856f1710395edb07`.
- New USDC frontend is deployed from b2332da; production build and CI passed. Public read-only browser tests passed across all five pages, desktop/light and mobile/dark, ENS/address lookup and retired-link404 checks: [UI report](artifacts/ui/usdc-ui-report.json), [lookup report](artifacts/ui/vault-lookup-report.json), [deployment and API evidence](deployments/usdc-web.json). The earlier full browser-wallet/model lifecycle below is not a repeated USDC onboarding test.
- Keyless MCP install/read proof on Windows: `pnpm mcp:doctor` passed with Node v24.18.0, pnpm 11.13.1 and host Codex CLI 0.157.0. `pnpm mcp:verify` installed into a fresh temporary profile, registered exactly one `capital-tree` server, discovered all 16 tools, rejected a write endpoint and read USDC root1/two nodes from Sepolia block11785724. No private config, wallet, team host or transaction was involved. [Runner](scripts/test-plugin-install.mjs). This is not a finance-write or independent-laptop E2E proof.
- Separate [read-only Codex chat server](scripts/mcp-readonly-server.mjs) tested over STDIO with `pnpm mcp:chat-verify`: one `getTree` tool, live USDC root1/two nodes at block11785887, invalid root rejected. Its Codex registration was tested in a temporary profile. Manual ChatGPT-desktop chat use remains to be verified by a user; no dashboard-local-connection claim is made.
- Updated [public MCP guide](https://agent-capital-tree-silk.vercel.app/mcp) deployed as `dpl_2YAGsD77UKgUocrZeqhKsMq6J5tT` (READY). Public no-vault route returned HTTP200 with the connection diagram, one-tool Codex registration/prompt and explicit non-observability of the local session; desktop/mobile screenshots showed no horizontal overflow. This is a documentation/visualization acceptance, not a remote observation of Codex.
- [Rami's published MCP guide](https://agent-capital-tree-silk.vercel.app/mcp) is publicly accessible without selecting a vault (HTTP 200), from production deployment `dpl_3Bzf15EMwUUJTqCtc9yXBz8qVAcv`. The verified public deployment API still points to the current USDC Sepolia controller. This is distinct from the project's main Vercel URL.
- ## Historical pre-USDC acceptance

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
