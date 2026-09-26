# MCP connection audit — 26 September 2026, 20:52 UTC

The actual Codex `capital_tree_demo` entry pointed to the deleted `.main-onboarding` checkout. The current checkout also lacked the generated capital bundle. Rebuilt the runtime and replaced only that stale path in the private Codex configuration, preserving a private backup and all other settings. The launch now uses `packages/runtime/capital.mjs` in the main repository, the explicit `usdc-full-vaults` deployment, `root-agent.agentcapitalusdc.eth`, and the existing Sepolia write flag. Existing encrypted profiles were reused without changes.

Two real STDIO MCP smoke runs connected and listed 23 tools. Setup, tree, PNG results, and the excessive-budget error passed. Final observed block: **11788671**, hash `0x73802c03ff144c6d8726e579f81c9d2a8fbb16a7c74457552a0dd3eed4434974`.

## Current state supersedes previous recovery instructions

- Historical controller: `0x17a932987f3cAcFec067c4C1bbE6946963d87F13`.
- Root 4 / `root-agent.agentcapitalusdc.eth`: **permanently revoked**, no children, zero aggregate USDC.
- Vault: `0xC9c7926191b7928F838579D74CdA380A66A8CD9A`.
- Owner and bound operator: `0x4E09c220BD556396Bc255A4DD24F858Bafeba6f5`.
- Preserved local signer: `0x6a315378E72DA53BE17EE142674A93c7B0DFf13b`; does not match the bound operator and has zero native gas.
- No transaction was submitted during this audit. The transaction that revoked/emptied the root was not identified by this read-only connection test.

The previous instructions to authorize this signer, fund its gas and execute the two-child demo are obsolete for this revoked root. Do not replenish it. Recovery preparation now rejects revoked roots before key creation or wallet handoff; setup exposes a clear permanent-revocation blocker. Selecting another active root or creating a new root requires an explicit decision about its controller and budget. The historical connection intentionally does not create new roots.

## Verification and remaining gates

- Runtime TypeScript compilation and bundle build passed.
- WSL focused runtime/session/key/orchestration tests: **14 passed, zero skipped**. Includes rejected revoked-root preparation without creating a key, signer/gas/target checks, key preservation, and allocation retry semantics.
- `scripts/test-capital-connection.mjs <settings.json>` checks protocol/catalog, setup, current tree, graphics and budget validation without assuming a historical balance or submitting transactions. Generate settings with `node packages/runtime/capital.mjs settings <root> --deployment usdc-full-vaults --enable-sepolia-writes`.
- The current already-running chat has no Capital tools loaded. Reconnect the MCP or start a fresh Codex session to load the corrected registration. External STDIO protocol success does not prove desktop-host reconnection or image rendering.
- The two-child wallet E2E remains uncompleted. No autonomous worker was started. No additional funding, wallet signing or private key import occurred.
- Existing unrelated staged UI changes were preserved.
