# Kanoki — Binding implementation plan

As of 26 September 2026. Product decisions are fixed; implementation is in progress, and actual acceptance status is in STATUS.md. This plan supersedes earlier brainstorming. Read it with STATUS.md after context compaction.

## Aktuelle Gestaltung und Veröffentlichung

Der korrigierte Kanoki-Brief und `KANOKI_DESIGN.md` ersetzen ältere Gestaltungsentscheidungen unten: Die neueste Nutzerkorrektur stellt die shadcn-Sidebar wieder her; Kanoki-Branding, explizites dunkles/helles Theme und Fraunces/IBM Plex bleiben. Alle asynchronen Datenansichten nutzen sichtbare Skeletons, Overview-Aktionskarten sind gleich breit mit unten ausgerichteten hellgrünen Buttons, ERC-20-Anzeigen werden auf drei Nachkommastellen gerundet (kleine positive Restbeträge <0.001). Eingaben und Transaktionen behalten ihre volle Genauigkeit. Bestehende Onchain- und MCP-Schnittstellen bleiben erhalten. Die gelieferten PNG-Logos werden unverändert eingebunden. README und GIF zeigen Kanoki; die GIF-Aufnahme ist ausdrücklich illustrativ. Der Nutzer verlangt nach jedem geprüften Änderungsblock Commit als CodeByNikolas, Push und Deployment. Veröffentlichung erfolgt auf `main`; neuestes freigegebenes Deployment-Ziel ist `https://kanoki-app.vercel.app/`.

## Current demo: chat-managed capital and autonomous workers

### Onboarding repair and current delivery target (26 September)

Latest user clarification: **kanoki.eth** is the next onboarding target, and another agent owns its implementation. Confirm its controller, active root and owner-approved budget before financial testing. Historical root-agent.agentcapitalusdc.eth below is revoked and its local profile was deleted by its owner; the former two-child plan must not be replayed. This clarification authorizes no additional deposit or migration. Final deployment to kanoki-app.vercel.app is assigned to the project owner with Vercel access.

All new work is committed and pushed to **main**, not work/rami. Preserve native worker support already merged on main. Current user acceptance is a chat-managed demo, not another paid/autonomous worker run: existing `root-agent.agentcapitalusdc.eth`, historical controller `0x17a932987f3cAcFec067c4C1bbE6946963d87F13`, root 4, approved **0.10 total Test-USDC**. Create two generic child vaults with 0.02 each, leaving 0.06 at the root, only after the owner authorizes the correct local signer and provides native gas. Never confuse it with root 4 on the current `agentcapitalvault.eth` controller. No additional USDC deposit or migration is authorized.

Capital mode exposes explicit session-local `selectCapitalRoot`, required write-target confirmation, and owner-reviewed `prepareOperatorRecovery`. Read selection never changes write authority; switching closes the old companion and preserves keys/journals. Ordinary prepare still rejects a mismatched bound operator. Recovery only prepares/reuses a private key and a wallet handoff; it never imports the owner key or changes onchain binding itself. Schema errors explain raw units and the demo input cap, which is not a contract balance cap. Setup/tree graphics distinguish onchain rights, controller, active root, local signer match, shared capital, local gas and action readiness.

An explicit `--deployment usdc-full-vaults` recovery connection retains access to the user's already-funded historical root. It does not guess controllers from numeric IDs and does not create new roots. The separate, previously authorized `raglibol` site may serve this recovery deployment via `ACT_USDC_RECOVERY_DEPLOYMENT=full-vaults`; the canonical app remains on the current deployment. This narrow recovery exception supersedes the earlier no-legacy-access rule only for existing funds; no general version selector or capital migration is added.

Owner handoff groups remaining authorization, funding shortfall and native gas reserve. Funding uses the aggregate across all vaults and is checked again after approval. Gas top-up is a separate owner-reviewed transfer to the currently bound local signer, up to 0.01 Sepolia ETH, not a fee guarantee. Child simulation and estimated maximum fees are checked before broadcast. Repeated child operation keys reconcile without duplicate allocation. Autonomy remains separately configured and must never be inferred from vault creation.

The owner wallet authorizes a separate local operator once. The capital-mode MCP then lets the current Codex or Claude chat manage real ENS child vaults and bounded allocations. `createChildVault` does not start an AI process and reports `dispatchStatus: not_requested`. It needs no Docker, inference key or provider configuration. The owner key never enters the MCP. The local operator needs Sepolia ETH for direct writes; root funding and operator authorization remain wallet actions. Bound operators must be reused rather than silently replaced. Existing worker and gas journals block an unsafe mode switch.

For an autonomous child, use `spawnChild` with an explicit model, task, allocation and narrower mandate. Docker and a configured native Codex host are required. The preferred worker inference path uses a private OpenAI API key with `gpt-6-luna` / `high`; ChatGPT login is an alternative and CLIProxyAPI is optional when explicitly configured. The live funded API-key E2E is recorded in ACCEPTANCE.md. No automatic Codex subagent hook creates onchain custody.

`pnpm mcp:capital` starts and manages the local capital companion on Linux or WSL2, reuses private state and exposes 23 tools, including setup/read helpers. The base companion has 17 tools; the keyless read-only server has three. Every MCP response carries a locally rendered dashboard PNG and a Mermaid fallback without repeating a chain read or write. Large trees split into pages from one snapshot. The host must support local image display; MCP delivery alone does not prove a desktop GUI renders the image. `prepareRootSetup` opens the normal wallet browser for review but never signs a transaction.

The read-only MCP works without a signer or Docker on supported Node hosts. Its keyless installation tests use disposable profiles and verify a live Sepolia tree. The public dashboard independently reads Sepolia; it cannot observe a local STDIO MCP session without explicit pairing. Financial writes on a new external jury laptop, native macOS signing, ChatGPT-login worker E2E and Claude Code financial E2E remain acceptance gates. Avoid repeating completed seed, payment and worker transactions.

## Current change: minimal vault proxies
User decision: replace repeated full CapitalVault deployments with non-upgradeable EIP-1167 clones. Each vault retains separate funds and state. Shared pool/token/Permit2 configuration stays immutable in the implementation; only the controller binding is initialized in clone storage. VaultFactory deploys and initializes each clone atomically. The implementation is locked and no upgrade authority exists. ENSv2 ManagedRegistry deployments remain unchanged.

Acceptance: reject unauthorized/repeated/zero-controller initialization; prove independent custody, ENS checks, swaps, LP lifecycle, owner recovery, and Circle ERC-1271/x402 settlement through the proxies. Record complete child-spawn gas, not only proxy deployment gas. Stage a new Sepolia controller and namespace with a separate transaction journal and MultiBaas label; retain old onchain funds and names. Switch the current manifest and website only after the new deployment works. UI currency labels say USDC; preview banners continue to identify invented sample balances.

All future public deployments must also be verified on Etherscan. Keep the API key outside Git. Release/deployment runners must finish with source verification and EIP-1167 implementation association, including constructor-created registries and per-node registries. Re-run the read-only verification scanner after creating additional roots/children; source verification is an explorer operation, not an extra onchain transaction.

## Current extension: official Sepolia USDC and x402

User decision, 26 September: rapid prototyping without backward compatibility. Switch the frontend exclusively to the new USDC version. Do not add a version selector, legacy link resolution, or migration. Existing onchain capital remains unchanged.

Use the confirmed 20 Circle test USDC for an additive USDC version. Preserve the existing ACT-A/B contracts, ENS links, and root 1. The new version needs a separate ENS namespace and new immutable factories and controller. Official token: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, six decimals, chain 11155111.

Sequence: (1) fork the real Circle contract locally to prove capital delegation and recovery; (2) implement a narrow PAY right and EIP-3009/ERC-1271 verification against the current ENS mandate, binding recipient, amount, nonce, and time window exactly; (3) use a standards-compliant HTTP 402 flow with a facilitator that explicitly supports Sepolia; (4) accept the additive public deployment and indexing; (5) update UI, companion, setup guide, and Vercel. No generic transactions, implicit PAY expansion of existing policies, or mint calls on Circle USDC. Existing per-action limits still apply; the vault balance bounds total spending. USDC alone is not an x402 integration.

## 1. Product, scope, and partners

### Dashboard redesign, requested 26 September

Replace the overloaded single view with five addressable pages: Overview, Agent Tree, Activity, Applications, and Setup. Use a shadcn/ui sidebar, adding Badge, Button, Card, Sheet, and Table as needed. Frontend Design, Impeccable, and shadcn MCP support the work. Acceptance requires a calm layout, 16px body text, at least 14px supporting text, ample spacing, and system light/dark mode.

Give the tree its own full page. Selecting a node opens clear details about capital, ENS name, actual rights, and inherited limits. Preserve root and preview context across pages. Overview shows only key state and next steps; full history and LP management have their own pages. Present the product as delegated agent capital. Trading is an existing application; x402 service purchases are now part of the USDC scope. Generic transactions and currency conversion remain future work.

Preserve live APIs, wallet actions, owner recovery, error and staleness guards, and honest MultiBaas coverage. The redesign adds no contract function and does not rerun completed financial flows. Its separate Sol High worktree is reviewed by the lead agent. Update the read-only browser smoke; test desktop/mobile, both themes, keyboard/details, and route changes. Review and commit coherent changes separately before pushing and publishing on Vercel.

Agent Capital Tree delegates real capital along an agent tree. Every agent receives its own vault and bounded mandate. It may transfer some available capital to subagents whose rights can only narrow. The human owner retains final recovery authority. The root agent is a human-authorized operator; model intelligence is not a security assumption.

The product limits the financial blast radius of a compromised agent. It does not pay model bills or guarantee trading profit or preservation of the original dollar value.

| Partner | Concrete contribution | Intended regular category |
| --- | --- | --- |
| ENS | ENSv2 Enhanced Access Control as the authoritative role source, real subnames, and linked registries | Best Use of ENSv2; $3,000 / $2,000 / $1,000 |
| Uniswap | Bounded v4 swaps and the full LP lifecycle, with separate management and recovery | Best Uniswap Stack Contribution; $3,000 / $2,000 / $1,000 |
| Curvegrid | MultiBaas indexing of capital and action history for dashboard and master agent | Best AI Agent Project ($1,000), plus Best Digital Asset Dashboard ($1,000) |

World is excluded. Plan for three partners and no fourth integration. Multiple categories from one partner do not promise cumulative prizes. MultiBaas is optional under Curvegrid's rules but its real integration is in scope.

### Binding MVP

- Ethereum Sepolia, chain ID 11155111; at most three agent levels including root and 32 nodes per root.
- Public factory for user roots under a verified project ENS namespace. Each user needs only their wallet, not an individual ENS purchase flow.
- The current version uses official Circle test USDC and a clearly valueless six-decimal DEMO-USD token. Exclude rebasing and fee-on-transfer tokens. Account only in raw token units.
- One allowed Uniswap v4 pool, no custom hook, fixed fee tier and tick range, at most one active LP position per vault.
- Own Codex plugin and MCP flow; tasks originate in Codex. A Next.js dashboard shows state and supports wallet management actions.
- Isolated Docker workers with separate keys and workspaces. HomeBox is the demo runtime, not required jury infrastructure.
- A control panel for tree, inherited rights, capital, balances, LP, payments, and history. No separate username/password system; a wallet connection suffices for owner transactions.
- No arbitrary-call engine, Uniswap hooks, automatic LP optimization, cloud signer, public runtime relay, or automatic SSH provisioning.

## 2. Architecture and binding security rules

### ENS roles, name tree, and capital

An immutable controller and factory, vaults, and adapted ENSv2 Permissioned Registries form the onchain core. The controller manages the tree; registered ENS resources carry real finance roles. Numeric rules belong in vault/controller logic, not ENS text metadata.

Each node binds a stable internal ID, parentId, rootId, agent and vault addresses, registry, label, original EAC resource generation, and policy. Nested registries represent real ENS subnames; a dotted string alone is insufficient. Fix the exact compatible ENS beta version and deployment in P1.

- Native ENS EAC combines only ROOT_RESOURCE and the local resource within one registry; roles do not automatically inherit from parent names. Contracts check the bounded ancestor chain on every normal action.
- Separate finance roles for delegation, swaps, LP management, fee collection, regular LP exit, restriction/revocation, and recovery. The controller uses EAC admin roles only through checked management functions; workers get no freely usable registry admin rights.
- No regular finance roles on ROOT_RESOURCE. The project team has no financial admin backdoor or upgrade right over user vaults. Controller registry administration is reachable only through user-authorized functions.
- Disable name transfers and generic ERC-1155 operator approvals for the managed capital tree. Resolver, parent, subregistry, and upgrade paths must not bypass rights.
- Each normal action checks current ENS registration, resource binding, canonical path, actual caller, local EAC role, allowed action, and all ancestor policies and revocation markers. Expiry and re-registration that change a resource disable old mandates.
- Policies contain capabilities, token/pool allowlists, maximum amount per action and token, and expiry. Effective limits use the minimum amount, intersection of allowlists, and earliest expiry. Do not add a parallel blacklist.
- Allocation transfers assets from parent vault to child vault. A vault can delegate only free balance. Internal allocation is not new funding and must not be counted twice in root totals.
- Per-action limits are not cumulative loss or turnover limits. Vault balance and constrained capital inflow bound exposure. Display trading volume, allocated capital, and current balance separately.
- Existing policies can only tighten. More capital requires an authorized parent allocation; more rights require a new node. Subtree revocation is permanent in the MVP; new work gets new nodes and keys.
- Parents manage only descendants. Removing a delegation role or revoking a node stops descendants through the checked authority chain. Revoking one local action role is not a global revocation; the UI must distinguish these operations.
- No arbitrary calldata, delegatecall, or freely chosen payout recipient. Use typed bounded methods and fixed adapters. Reentrancy protection and controlled token approvals include callback paths.

### Owner, root operator, and emergency exit

The human owner is immutable on the root. Only that owner binds or replaces the root operator and sets its mandate. Changing the operator invalidates the old delegated authority generation and workers while assets remain recoverable. The project team cannot replace a user's wallet.

Normal parent recovery requires current parent authority. It stops the target branch, closes its LP positions, and moves funds stepwise to bound parent vaults. With 32 nodes, this may need multiple explicit transactions; show progress and allow resumption.

The owner also has a narrow ENS-independent emergency exit: permanently disable activity, close existing fixed LP positions, and recover assets to bound parent vaults or ultimately the owner address. It cannot introduce strategies, swaps, broader rights, or arbitrary recipients. It works after ENS expiry, detachment, revocation, runtime failure, or MultiBaas failure.

Revoking LP management stops future agent actions but does not remove price risk or LP exposure. Exit and recovery are separate actions. The owner explicitly sets minimum outputs and deadline for emergency exit, which an expired mandate cannot block. Remaining assets are recoverable, not a guaranteed original dollar amount.

### Uniswap integration

The vault holds the PositionManager NFT and all payouts. Workers receive no NFT transfer or operator approvals. A typed swap adapter uses verified v4 contracts; LP operations call PositionManager directly. There is no access to arbitrary router commands.

- MVP actions: bounded exact-input swap, open/increase position, collect fees, close position, burn empty NFT.
- Bind pool, token, tick range, input maxima, output minima, deadline, and vault recipient on every call. Policy limits input and pool; output minima are not oracle-based loss protection.
- Fee collection uses the tested zero-liquidity increase in the pinned periphery and must not reduce position liquidity or transfer principal.
- A controlled test swap creates actual demo-pool fees. Never depict a non-earning position as having earned fees.
- No subscriber or custom hook. Authorization sits at the vault seam; router/hook senders are not automatically the agent identity.
- Bound token and Permit2 approvals to required contracts, amounts, and validity; account for and test residual allowances.

### Curvegrid MultiBaas

MultiBaas provides indexed history, never authorization. Register the controller ABI and Sepolia address and enable event synchronization. The free instance plan permits only a 100-block lookback. Per the 26 September user decision, there is no paid upgrade. The original indexing starts at block 11783944; complete history acceptance uses a root created afterward. Older roots retain separate RPC/transaction evidence, and missing MultiBaas history is neither reconstructed nor called complete. Foundry remains the contract deployment tool.

The controller emits canonical events for node creation, allocation, recovery, policy/operator changes, revocation, and successful swap/LP actions. Finance events identify root/node, tokens, actual amounts, and NFT/liquidity as relevant. External event reports are accepted only from the registered vault. Failed transactions emit no events.

- A small server-side MultiBaas adapter uses the official TypeScript SDK or REST for filtered event queries and aggregation. Vercel holds a scoped data key; admin setup credentials remain local.
- `getCapitalActivity(rootId, cursor)` returns ordered paginated onchain history with provenance, shared by dashboard and master MCP read tool.
- Poll every ten seconds while visible and after confirmed transactions. No webhook, queue, separate indexer database, or long-running server loop in the MVP.
- Distinguish external deposits, internal allocation, recovery, trading volume, and fees. Read current balances, LP, and effective rights directly from contracts. Do not infer PnL from capital flows or show a manipulable demo-pool USD valuation.
- Deduplicate by chainId/txHash/logIndex; sort by block, transaction, and log; replace observations on refresh. Show index lag and confirmation status. Check reorgs against canonical receipts; a confirmation is not finality.
- Register child addresses separately only if required events are not reflected centrally. Do not assume automatic factory discovery.
- On MultiBaas failure, show a clear error or stale history. Keep directly read state and wallet emergency exit usable. Do not silently substitute RPC history and imply MultiBaas is working.
- The master may use confirmed activity plus current balances to identify free funds and perform an authorized recovery/reallocation. Old or incomplete history alone is insufficient; current onchain checks remain mandatory.
- MultiBaas neither creates nor holds worker keys. Its optional unsigned transactions and cloud wallets are unnecessary.

### Runtime, keys, and Codex plugin

A local companion orchestrates Docker workers. The human authorizes its root operator address in a wallet transaction. Each worker gets its own key via a short-lived private mount and an authenticated connection to its MCP context. Keys must never appear in prompts, tool output, logs, Git, or Vercel. Encrypted keys live outside the project. The companion decrypts them using a separate random password in a host-user-only file. This permits unattended operation; the nearby password file does not protect against a compromised host or process running as the same OS user. Worker isolation, not an additional interactive passphrase, is the tested boundary.

Workers run with Docker `--network none`. In native Codex mode, a host app-server holds OpenAI authentication (a private API-key file is preferred; dedicated ChatGPT login is an alternative) and sends execution to the worker exec-server through a private loopback relay. Scoped financial tools are forwarded by the host; account credentials and wallet keys stay outside the container. In explicit CLIProxyAPI mode, the existing worker-bound Unix gateway supplies scoped MCP and inference access. Container loopback is not host loopback. General outbound network access is blocked.

Containers receive no host home, full Codex profile/auth directory, parent or sibling key, or Docker socket. The host and companion are trusted; containers do not protect against host compromise. Onchain vaults still bound a compromised worker with direct RPC access.

Use an explicit spawn flow, rather than treating native `spawn_agent` as a security boundary:

1. An authenticated parent worker supplies task, model, ERC-20 asset and amount, additional restrictions, and an idempotency key.
2. Runtime prepares the child key and address. The call binds to the actual parent context; a model-provided agentId authenticates nothing.
3. The parent signer authorizes one atomic node/ENS/role/allocation transaction. `spawnChild` carries a bytes32 operation key; the controller stores the result by root, parent, and authority generation with a hash of parameters. Repeating identical parameters returns the existing child without more funding; changing parameters under the same key fails. Children require a current mandate.
4. Runtime waits for confirmation and reconciles uncertain broadcasts using its persistent journal and the contract. A retry cannot create a second child vault or allocation.
5. Only then start the worker. A process failure after allocation leads to a resumable launch or explicit revocation and recovery. Stop the worker after a reorg and reconcile again.

The local runtime journal atomically stores operation state, public IDs, and workspace mapping; model tasks stay local. Provide bounded Sepolia ETH gas separately from trading capital; do not create an unlimited worker faucet. Never forward root/sibling keys or unlimited provider credentials.

User follow-up, 26 September: prefer OpenAI API-key setup using a private host file and ephemeral app-server authentication. Retain ChatGPT login and explicit CLIProxyAPI modes without silent fallback. API inference billing is separate from vault allowance. Record real-key inference and financial acceptance separately from synthetic protocol checks. Preserve existing HomeBox services and control-plane authentication.

User decision, 26 September: jury setup and funded worker spawning must work with a normal Codex login, without CLIProxyAPI. Use a dedicated private native Codex profile on the trusted host, with isolated Docker execution and scoped financial tools. Check login and requested model availability before allocating capital. Preserve existing HomeBox services and keep CLIProxyAPI as an explicitly selected optional mode; never silently fall back between modes. A deterministic mock proves routing only; record a real normal-login run separately before claiming live acceptance. Test independent installation with fresh runtime/Codex profiles.

Codex `SubagentStart` hooks exist but guarantee neither isolated keys nor blockable creation. Leave hooks disabled. The plugin provides its own MCP tools and guidance; launch native workers through the pinned app-server/exec-server protocol, or `codex exec --json` in explicit proxy mode. Pin CLI/plugin versions and test installation in a fresh profile.

### Public interfaces and UI

Shared TypeScript types and generated contract ABIs define Node, Policy, TokenAmount, OperationStatus, and Activity. Node IDs are not proof of authority. RPC and MultiBaas responses include block and source information; financial amounts are integers, never floats.

SDK/MCP functions: `createRoot`, `spawnChild`, `allocateCapital`, `getTree`, `getEffectivePolicy`, `getCapitalActivity`, `tightenPolicy`, `swap`, `openPosition`, `increasePosition`, `collectFees`, `closePosition`, `revokeSubtree`, `reclaimAssets`. Operator binding and owner emergency exit are wallet actions. Connecting to the website does not grant root write access.

Use a graphite technical interface with readable contrast, green active links, and clear revoked/expired labels. Entry points: inspect the demo, create a vault, install the plugin. Show ENS names, relationships, free funds, and mandates in the tree. Details show local and inherited restrictions with their origin, balances, LP position, and real transaction links. An active onchain mandate does not prove an agent process is running. Label local failed attempts as local diagnostics.

Jury prerequisites: wallet, Sepolia ETH, Node.js, Docker, Codex, and the user's own normal Codex account access. Flow: open Vercel → connect a Sepolia wallet → create a root and obtain demo assets → install CLI/plugin and test model access → bind operator with wallet → issue a Codex task → follow actions in dashboard → revoke a subtree → close LP → recover funds. The website needs no localhost access; the plugin client needs no public server. The shared MultiBaas instance covers public roots from its documented indexing start; disclose that boundary. Independent contract deployments need their own indexer configuration. Inspecting the demo and manual wallet actions work without model access.

## 3. Work packages, gates, and publication

Stack: pnpm TypeScript workspace; Next.js, shadcn/ui with Base UI, viem with an injected wallet provider, custom SVG tree; Solidity/Foundry; Docker; Playwright with Chromium and MetaMask for real wallet end-to-end tests. Use existing tools and install missing Foundry locally with a pinned version. No host updates or automatic hooks.

| Package | Scope | Done when |
| --- | --- | --- |
| P0 | Plan, status, work rules; workspace, Git, CI | Documents saved; reproducible base and checks |
| P1 | Verify ENS beta/namespace, v4, plugin, browser wallet, provider, MultiBaas | Versions/ABIs pinned; real calls and local mint/collect/exit proof |
| P2 | Managed ENS registries and finance roles | Negative role/operator/lifecycle tests pass |
| P3 | Capital tree, atomic spawn, emergency exit | Budget, ancestor, idempotency, recovery tests pass |
| P4 | SDK and shared types | Real contract integration works from TypeScript |
| P5 | Six-page dashboard | shadcn sidebar, responsive tree/rights and node details, separate Uniswap and payments pages, legible text, system theme, labeled samples, wallet guards |
| P6 | Isolated runtime and model access | Two workers run with distinct keys and demonstrated separation |
| P7 | Codex plugin and installation | Fresh profile installs plugin and creates a real child |
| P8 | Bounded Uniswap swap | Allowed swap succeeds; invalid inputs/recipients fail |
| P9 | LP lifecycle and revocation | Mint/increase/collect/close and parent/owner exits work |
| P10 | MultiBaas and live dashboard | Real indexed events drive history and MCP read; failure is visible |
| P11 | Independent jury onboarding | New wallet and fresh runtime require no demo keys or private host access |
| P12 | Integration, security, browser acceptance | All mandatory checks below pass and are reviewed |
| P13 | Public repo, Sepolia, HomeBox demo, Vercel, submission artifacts | Public URLs and independent flow work; partner contributions are evidenced |

Dependencies: P2/P3 fix interfaces for P4. P5 and P6 can run after P1 in parallel. P7 depends on P4/P6; P8/P9 depend on contracts/SDK. P10 follows the event schema and can proceed alongside UI integration. Start deployment tests before P12; P13 is verified publication.

The lead agent owns architecture, interfaces, integration, and reviews. Use at most three parallel subagents with separate branches/worktrees and explicit file ownership. Luna Max handles bounded SDK, frontend, docs, and tests; Sol Medium handles contracts, isolation, and security integration. Preserve others' edits. After each feature, run relevant tests and diff review, then make an individual commit with meaningful subject and rationale as CodeByNikolas. Avoid untested aggregate commits.

Targets: public GitHub repository `CodeByNikolas/agent-capital-tree`; new Vercel project in `tumblockchains-projects`. Publication is already authorized. Preserve existing projects. Keep test keys and private runtime data out of Git; inspect logs and screenshots for secrets.

### Technical gates before integration claims

1. ENS: usable Sepolia namespace, actual ABI/source compatibility, atomic registration and role initialization, linked registries. Do not silently replace EAC with metadata or an independent ACL.
2. Uniswap: deployed bytecode/ABIs, test pool, local and then Sepolia swap/LP proof. Create a pool if liquidity is missing; keep the gate open if contracts cannot be used.
3. Runtime: current plugin format, model availability, per-worker inference without shared host credentials, real container separation. No fallback to one shared parent key.
4. Wallet: pinned MetaMask in a persistent Playwright Chromium profile, connection, and real Sepolia signature. A mock wallet does not satisfy this gate.
5. MultiBaas: Sepolia instance, data API key, ABI link, indexing start within the free 100-block window, and live query. The fresh acceptance root must be entirely after that start. If access fails, mark integration open while continuing app and emergency-exit work.

Record unmet gates and their concrete blocker in STATUS.md. Continue independent work; do not silently narrow scope or claim an integration succeeded. New product decisions are needed only if a core prerequisite is genuinely lost.

## 4. Test and acceptance plan

### Contracts and security

- Test new financial flows first on a disposable local Sepolia fork. Then use public Sepolia for real wallets, MultiBaas indexing, and the published app. A fork does not replace external integration evidence. Do not introduce a second development platform.
- Capital is conserved through transfers; no double spend or duplicate allocation on repeated spawn. A child cannot use root or sibling balances or allowances.
- Child policies only narrow. Ancestor restrictions and revocation affect existing descendants while siblings remain independent.
- Direct RPC calls and forged MCP IDs cannot bypass authorization. Resource changes, expiry, detachment, name/NFT transfers, and operator approvals cannot expand finance rights.
- ENS failure or an invalid path blocks normal actions, but the human owner can recover remaining assets including LP. Project operators and former root operators cannot.
- The LP NFT stays in its vault; fee collection cannot remove principal; all payouts go to bound vaults. Revocation blocks management while preserving the intended emergency exit.
- Reject manipulated router data, wrong tokens/pools/recipients, excessive amounts, expired deadlines, callback or reentrancy attacks, and unauthorized approvals.
- Unit and Foundry fuzz tests cover invariants; a real v4 integration exercises the protocol lifecycle. Negative tests target contracts directly, not only the UI.

### Runtime and data

- Test a fresh install and two isolated workers. Parent/sibling keys, Docker socket, and provider master credentials must be unavailable inside workers.
- Cover confirmed, failed, repeated, and initially ambiguous transactions; worker launch failure after allocation; process restart, journal loss, and reorg. Retrying one operation key cannot pay twice. After key loss, reconcile the onchain tree before issuing a new spawn ID.
- Match MultiBaas events to receipts, clean up duplicates/reorgs, and ensure index lag or API failure cannot imply current balances or successful integration.
- Do not double-count internal transfers in root aggregates. Show outside direct transfers through current balances. Never invent onchain events for failed actions.
- The master reads history and current balances, reclaims actually free funds, and reallocates them under valid rights. Undocumented cloud automation is not required.

### Real end-to-end test on the published Vercel app

Create separate deployment and user test accounts and protect them outside the repository. Give the user only public funding addresses and an estimated Sepolia ETH requirement. Do not record MetaMask setup or seed import. Browserbase supplements public UI checks; wallet signatures use a separate local browser profile.

1. Connect a fresh wallet, choose Sepolia, create a root, claim demo tokens, and fund it.
2. Install a fresh Codex profile and plugin; start a separate runtime and bind the operator through the wallet.
3. The master delegates to a child and grandchild with narrower rights; dashboard shows real ENS links and effective policy.
4. An allowed swap and LP open/increase succeed. A controlled additional swap produces fees; verify fee collection.
5. Excess amount, unsupported asset, and rights expansion fail; at least one direct negative onchain call proves contract enforcement.
6. Revoke a subtree; descendants stop acting and the sibling vault remains usable.
7. Stop runtime; the owner closes the existing LP and recovers remaining assets.
8. Reload the website; state, history, and explorer receipts agree. A MultiBaas outage cannot prevent emergency exit.

Also test mobile layout, keyboard use, legible states, rejected wallet requests, wrong network, and RPC failure. The report records commit, Vercel deployment, contract addresses, versions, transaction evidence, and sanitized screenshots. Builds and mock demos alone do not complete acceptance.

## 5. Prerequisites, evidence, and sources

Already verified: GitHub login CodeByNikolas; Vercel access to TUM Blockchain Club; Node, pnpm, Docker, Codex, local Playwright Chromium/Xvfb, and Browserbase access. Provide Foundry at project/user scope. Access alone is not proof that a new application exists.

Sepolia funding for the fresh MultiBaas acceptance root arrived. ENS registration, instance URL, initial administrative setup, and scoped runtime key exist. STATUS.md holds actual evidence and open work. Add a dedicated RPC only on demonstrated need. Direct contract use needs no Uniswap API key. Never request personal seed phrases. Preserve existing HomeBox inference and control-plane profiles; native Codex tests use a separate dedicated jury login.

Submission needs public contracts, tests, and documentation; clear setup instructions; team/social details from the team; and specific code references per partner. Uniswap requires FEEDBACK.md plus the developer feedback form linking to it. Curvegrid requires a README with the project description, setup/tests, and an honest MultiBaas experience report. Do not mark ETHGlobal entry or feedback submission complete without successful delivery. Request missing team details at the submission step.

Primary sources, researched 25 September 2026; live ABIs and deployments remain subject to P1:

- ENSv2 EAC: https://docs.ens.domains/ensv2/enhanced-access-control/
- ENSv2 Registry: https://docs.ens.domains/ensv2/permissioned-registry/
- ENS source: https://github.com/ensdomains/contracts-v2/tree/48b3e2d39513b9dd32ef1850877a29009bc807b9
- Uniswap v4 deployments: https://developers.uniswap.org/docs/protocols/v4/deployments
- v4 periphery: https://github.com/Uniswap/v4-periphery/tree/9969eec44cfdf07e24b41de47f40276a58401976
- v4 core: https://github.com/Uniswap/v4-core/tree/46c6834698c48bc4a463a86d8420f4eb1d7f3b75
- MultiBaas contract management: https://docs.curvegrid.com/multibaas/manage-contracts
- MultiBaas event queries: https://docs.curvegrid.com/multibaas/event-indexing
- MultiBaas API: https://docs.curvegrid.com/multibaas/api/
- Official Sepolia/wallet/indexing example: https://github.com/curvegrid/matsuri-stablecoin-sample-app
- Curvegrid prize brief: https://ethglobal.com/events/tokyo2026/prizes/curvegrid
- ENS prize brief: https://ethglobal.com/events/tokyo2026/prizes/ens
- Uniswap prize brief: https://ethglobal.com/events/tokyo2026/prizes/uniswap-foundation
- Uniswap feedback: https://developers.uniswap.org/hackathon-feedback
- Codex hooks: https://learn.chatgpt.com/docs/hooks
- Codex plugins: https://developers.openai.com/plugins/build/plugins
- Playwright extensions: https://playwright.dev/docs/chrome-extensions

Completion requires a public repository, real ENS/Uniswap/MultiBaas integration, independent plugin installation, and a fully tested user flow on Vercel. The plan is settled; implementation is complete only after those proofs.
