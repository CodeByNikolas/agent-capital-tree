# MCP onboarding review — 27 September 2026

This is test and review evidence, not an implementation or release acceptance claim. The checkout was based on `2927f37` and received concurrent onboarding changes during the runtime test. Existing edits were preserved.

After fetching, remote main was `a9594c7`, with the Kanoki deployment cutover and newer verifier repairs already merged. The local tests below describe the older checkout and connected MCP, not acceptance testing of that newer remote revision. The user assigned implementation to another agent and assigned this session review/tests.

## Verified before the concurrent changes

- Connected Kanoki MCP: invalid `budgetRaw: "0"` rejected before execution, with a PNG; valid setup inspection reported no selected root or local signer and `writeReady: false`.
- Live `getTree` resolved `capital.agentcapitalvault.eth`, root 1, two nodes, at Sepolia block **11789135**, observed at **2026-09-26T22:25:06.434Z**. Structured data and dashboard PNG were returned. Reading did not select a signing root.
- `pnpm --filter @agent-capital-tree/plugin test`: **22/22 passed**, including copied-plugin startup without node_modules, strict argument validation, scoped bearer forwarding, error graphics and exact PNG links.
- `node scripts/test-mcp-chat.mjs`: passed the three-tool keyless STDIO flow at block **11789139**, including ENS/address/child lookup, malformed and missing-root errors, and PNG signature checks. The test exposed no financial write tools.
- `node scripts/test-guided-onboarding.mjs`: passed controlled wallet setup, restart reconciliation, no repeat funding, uncertain-send lockout and operator protection. These were fixture boundaries, not wallet signatures.
- Plugin and runtime builds passed. The initial Windows build hit sandbox filesystem restrictions; the approved retry passed.

## Concurrent-source test result

Linux/WSL `node --test test/*.test.mjs` in `packages/runtime`: **31 passed, 4 failed**. This result is not tied to one immutable source revision.

1. The old demo-cap test rejects amounts that the newly edited schema now accepts.
2. The old onboarding test omits the new explicit limit/funding confirmation parameters.
3. The edited session passed zero to an older built `capitalReadiness`, which rejected it. Rebuild before retesting a stable revision.
4. The CLI-native test exceeded its 10-second subprocess startup limit and received empty stderr, consistent with the earlier WSL acceptance note.

## Review findings in the in-progress implementation

### Saved setup can target a different selected root

Reproduced with `CapitalSession.inspect`: active root `5`, saved onboarding `viewedRootId: 4`, sufficient rights/balances and `missing: []` returns `writeReady: true`. `continueCapitalSetup` reads the saved test but substitutes `session.rootId` as its expected root. An explicit selection of another authorized root can therefore redirect the saved test.

Bind continuation to the saved controller, root, signer and authority generation before dispatch. Root or generation changes must not create a new allocation with the same saved test key. Add a negative test proving no transaction handler runs after either change.

### Final completion is not persisted

The continuation currently persists the request but not its confirmed result or authority generation. Onchain operation keys are scoped by root, parent and generation. Same-key reconciliation alone does not prevent a new allocation after an operator-generation change. Persist completion and verify its canonical operation/receipt before returning success on restart.

### Readiness and polling need distinct terminal states

`continueCapitalSetup` currently maps every non-ready state to `awaiting_wallet`, including disabled writes, unsupported controller, revocation and missing limit consent. It should distinguish recoverable wallet progress, missing user input, permanent blockers and uncertain execution; otherwise the host can poll indefinitely without progress.

### Snapshot and funding semantics need alignment

Onboarding status reads a latest block for gas and separately resolves a tree, while the enclosing readiness call may read yet another tree. Preserve the block used for each observation, or use a single pinned snapshot. Current-balance shortfall is not proof of incomplete historical funding; use confirmed funding/completion evidence so later usage or recovery cannot ask for another deposit.

### Distribution and public deployment remain gates

The in-progress implementation requires `rootCapitalLimit` and `createRootWithCapitalLimit`, which the checked-in current public controller manifest does not establish. A local contract edit cannot upgrade the immutable deployed controller. Verify an additive deployment, generated ABI, published wallet page and distributed MCP bundle together before claiming the new flow works publicly. Preserve existing roots and funds.

Live read at Sepolia block **11789212**: local manifest/MCP controller `0x7eDFa3D484d64b6bA3b5b2bcef51147E57133FFB` passed existing deployment verification, but its `rootCapitalLimit(0)` call did not succeed. The canonical `https://kanoki-app.vercel.app/api/deployment` returned HTTP 200 and controller **`0xeB2041B486D66aB91140FFcF54B66513D8eC40c8`**. These controllers differ. The normal handoff opens this canonical website while saved root discovery uses the MCP controller; the pair must be aligned before an end-to-end claim. No financial transaction was sent.

The fetched **remote main manifest matches the public app** and uses `kanoki.eth`; the mismatch is in this stale local checkout/connected MCP. Integrate the current remote release and rebuild/reconnect the local MCP before retesting. Do not repoint the website to the retired controller or replace private signing profiles.

`pnpm typecheck` on the concurrent sources passed plugin, SDK, MultiBaas and runtime, but failed the web package: its generated `capitalControllerAbi` does not contain `rootCapitalLimit`, `rootCapitalFunded` or `createRootWithCapitalLimit`. Update the ABI from the reviewed contract and rerun the complete typecheck.

Update the old 19-tool assertions for the added continuation tool, the demo-cap assertions and the server's old onboarding instructions. Rerun tests against a stable snapshot; rebuild distributed bundles after the source changes settle.

## Required end-to-end proof

One initial request, one explicit limit/funding answer, then only owner wallet signatures. The host keeps the task active, discovers the saved root, checks current authority and funding, executes the saved bounded test once, and independently reconciles its onchain operation and resulting balances/policy. Test restart, root switch, generation change, rejected signatures, RPC interruption and repeated continuation. No new live wallet signature or financial transaction was performed in this review.
