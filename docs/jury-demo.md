# Kanoki

Agent Capital Tree

Use the current USDC deployment in `deployments/usdc-sepolia.json` and the public dashboard. Old root links are intentionally unsupported. The exact public acceptance state is recorded in `STATUS.md`.

1. **Overview:** open the demo root by its vault address or `capital.kanoki.eth`. Show official Circle USDC separately from the valueless DEMO-USD pool quote. Capital is custody, permissions are a mandate, and neither proves that a worker process is currently running.
2. **Agent tree:** select the new `capital.kanoki.eth` root. Create a child through the companion when demonstrating delegation, then show its name, address, narrower amount limit and ancestors. ENS EAC supplies roles; our controller checks the ancestor chain on every action.
3. **Service purchase:** x402 Pay shows settlements from the new deployment only. An empty history is expected before its first payment. `deployments/usdc-payment.json` is historical integration evidence from an earlier controller, not a receipt for `kanoki.eth`. A configured companion can make a new purchase; do not claim old receipts belong to the new vault.
4. **Uniswap:** open Uniswap and inspect the vault-owned LP NFT and action history. Swapping, managing liquidity, collecting fees and exiting are distinct capabilities. The fixed pool uses USDC and a valueless quote; it is not a reliable dollar valuation. Revocation stops future management but does not itself close a market position.
5. **Activity:** show actual MultiBaas-indexed capital and strategy events, their coverage boundary and canonical receipt verification. Direct USDC payment events are outside the controller-only index; use their separate verified payment receipt.
6. **Setup:** show the owner recovery controls and the local companion/MCP guide. The human wallet stays separate from the companion operator for personal setups. Native Codex subagents do not automatically inherit capital; explicit delegation creates a separate ENS node and vault; an autonomous worker is optional.
7. **MCP live proof:** open [the public MCP guide](https://kanoki-app.vercel.app/mcp). In Codex, call `getTree` with `capital.kanoki.eth`: show the dashboard-style PNG and report the current block, balance and authorized actions from the result. Its state can change; do not rehearse a fixed balance. Every tool returns a graphic and real local image links, including action/error cards. `prepareRootSetup` opens the bounded setup link in the user's normal wallet-enabled system browser; it does not sign. For writes, prepare a new small root for explicit owner approval, fund at most 0.100000 USDC, bind the local operator, start the WSL2 companion with writes enabled, then use typed `createChildVault`/revoke/reclaim tools. Do not claim this public E2E succeeded without receipts. `pnpm mcp:verify` proves 17-tool discovery with writes disabled. The config-free capital connection exposes 23 tools; indexed history, paid services and autonomous workers are unavailable until separately configured in worker mode. Historical `root-agent.agentcapitalusdc.eth` is permanently revoked and must not be funded again.

Source entry points:

- ENS roles/registries: `contracts/src/ens/FinanceRoles.sol`, `contracts/src/ens/ManagedRegistry.sol`.
- Inherited authority and payment checks: `contracts/src/CapitalController.sol` (`_authorize`, `checkPayment`).
- Exact ERC-1271 payment verifier and Uniswap custody: `contracts/src/CapitalVault.sol`.
- HTTP402 purchase, retry journal and independent receipts: `packages/runtime/src/payments.ts`.
- Scoped identities and isolated worker dispatch: `packages/runtime/src/companion.ts`.
- MultiBaas query/receipt verification: `packages/multibaas/src/index.ts`.

Do not replay completed public financial runners or recover the live demo seed during a read-only presentation. The fork runner safely exercises revocation and recovery without public writes. Amount ceilings are per action; physical vault balances bound total spending. The service allowlist lives in the companion, not in onchain recipient policy. No audit, independent external-machine onboarding, automatic strategy discovery or guaranteed original-dollar recovery is claimed.

Uniswap’s feedback form and the ETHGlobal entry have not been submitted. Team/contact details and an explicit submission instruction are still required.
