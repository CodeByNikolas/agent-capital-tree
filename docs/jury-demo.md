# Kanoki

Agent Capital Tree

Use the current USDC deployment in `deployments/usdc-sepolia.json` and the public dashboard. Old root links are intentionally unsupported. The exact public acceptance state is recorded in `STATUS.md`.

1. **Overview:** open the demo root by its vault address or `capital.kanoki.eth`. Show official Circle USDC separately from the valueless DEMO-USD pool quote. Capital is custody, permissions are a mandate, and neither proves that a worker process is currently running.
2. **Agent tree:** open `capital.kanoki.eth`: the root delegates to Researcher, Trader and Liquidity; Trader delegates again to Risk check. Select these existing vaults to show separate balances, operator addresses, capabilities and ancestors. Risk check has a tightened 0.020-token per-action ceiling. These are real vaults with separate local operator keys; this recorded demo does not launch autonomous model workers. ENS EAC supplies roles; our controller checks the ancestor chain on every action.
3. **Service purchase:** x402 Pay shows the Researcher’s confirmed 0.010 Test-USDC payment. `deployments/kanoki-payment.json` records the current-controller transaction, HTTP402 flow, ERC-1271 authorization and receipt checks. Repeating the same purchase operation did not charge again. The seller is a controlled local research service, not a public merchant; the visible receipt remains on Sepolia. `deployments/usdc-payment.json` remains historical evidence.
4. **Uniswap:** open Uniswap and inspect the root and Liquidity vault’s separate LP NFTs, Trader’s 0.010-token swap and the fee-collection event. Swapping, managing liquidity, collecting fees and exiting are distinct capabilities. The fixed pool uses USDC and a valueless quote; it is not a reliable dollar valuation. Revocation stops future management but does not itself close a market position.
5. **Activity:** show actual MultiBaas-indexed capital and strategy events, their coverage boundary and canonical receipt verification. Direct USDC payment events are outside the controller-only index; use their separate verified payment receipt.
6. **Setup:** show the owner recovery controls and the local companion/MCP guide. The human wallet stays separate from the companion operator for personal setups. Native Codex subagents do not automatically inherit capital; explicit delegation creates a separate ENS node and vault; an autonomous worker is optional.
7. **MCP live proof:** open [the public MCP guide](https://kanoki-app.vercel.app/mcp). In Codex, call `getTree` with `capital.kanoki.eth`: show the dashboard-style PNG and report the current block, balance and authorized actions from the result. Its state can change; do not rehearse a fixed balance. Every tool returns a graphic and real local image links, including action/error cards. `prepareRootSetup` opens the bounded setup link in the user's normal wallet-enabled system browser; it does not sign. For writes, prepare a new small root for explicit owner approval, fund at most 0.100000 USDC, bind the local operator, start the WSL2 companion with writes enabled, then use typed `createChildVault`/revoke/reclaim tools. Do not claim this public E2E succeeded without receipts. `pnpm mcp:verify` proves 17-tool discovery with writes disabled. The config-free capital connection exposes 19 tools; indexed history, paid services and autonomous workers are unavailable until separately configured in worker mode. Historical `root-agent.agentcapitalusdc.eth` is permanently revoked and must not be funded again.

Source entry points:

- ENS roles/registries: `contracts/src/ens/FinanceRoles.sol`, `contracts/src/ens/ManagedRegistry.sol`.
- Inherited authority and payment checks: `contracts/src/CapitalController.sol` (`_authorize`, `checkPayment`).
- Exact ERC-1271 payment verifier and Uniswap custody: `contracts/src/CapitalVault.sol`.
- HTTP402 purchase, retry journal and independent receipts: `packages/runtime/src/payments.ts`.
- Scoped identities and isolated worker dispatch: `packages/runtime/src/companion.ts`.
- MultiBaas query/receipt verification: `packages/multibaas/src/index.ts`.

Do not replay completed public financial runners or recover the live demo seed during a read-only presentation. The fork runner safely exercises revocation and recovery without public writes. Amount ceilings are per action; physical vault balances bound total spending. The service allowlist lives in the companion, not in onchain recipient policy. No audit, independent external-machine onboarding, automatic strategy discovery or guaranteed original-dollar recovery is claimed.

The user reported submitting the Uniswap feedback form. ETHGlobal submission status must be checked separately; deploying this demo does not submit a prize entry. Team details are in the repository README.

## Reproducible checks

- `node scripts/test-live-demo.mjs`: read-only public API and desktop/mobile browser journey, including five vaults, two LP positions, the payment receipt and indexed controller events.
- `node scripts/test-mcp-capital.mjs`: current live MCP reads, images and disabled-write guard.
- `node scripts/extend-kanoki-demo.mjs`: inspect existing capital and the bounded demo plan. Its explicit `--execute` mode is a journaled financial runner, not a presentation command.
- Current chain evidence: [demo E2E](../deployments/kanoki-demo-e2e.json) and [x402 receipt](../deployments/kanoki-payment.json).

This covers the public demo’s on-chain actions, payment protocol, indexer and dashboard. It does not prove a fresh external juror’s wallet onboarding or autonomous model-worker execution.
