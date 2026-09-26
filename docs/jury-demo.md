# Jury walkthrough — Agent Capital Tree

Use the current USDC deployment in `deployments/usdc-sepolia.json` and the public dashboard. Old root links are intentionally unsupported. The exact public acceptance state is recorded in `STATUS.md`.

1. **Overview:** open the demo root by its vault address or `capital.agentcapitalusdc.eth`. Show official Circle Test-USDC separately from the valueless DEMO-USD pool quote. Capital is custody, permissions are a mandate, and neither proves that a worker process is currently running.
2. **Agent tree:** select `researcher.capital.agentcapitalusdc.eth`. Its separate vault receives a smaller allocation and an explicit PAY role. Show its name, address, narrower amount limit and ancestors. ENS EAC supplies roles; our controller checks the ancestor chain on every action.
3. **Service purchase:** show the public `deployments/usdc-payment.json` report and its Explorer receipt. A real HTTP402 request leads to a vault-bound EIP-3009 signature, ERC-1271 authorization, Circle settlement and paid response. A retry does not charge twice. The controlled seller is local and pays the test owner; it is not an independent commercial merchant.
4. **Uniswap:** open Applications and inspect the vault-owned LP NFT. Swapping, managing liquidity, collecting fees and exiting are distinct capabilities. The fixed pool uses USDC and a valueless quote; it is not a reliable dollar valuation. Revocation stops future management but does not itself close a market position.
5. **Activity:** show actual MultiBaas-indexed capital and strategy events, their coverage boundary and canonical receipt verification. Direct USDC payment events are outside the controller-only index; use their separate verified payment receipt.
6. **Setup:** show the owner recovery controls and the local companion/MCP guide. The human wallet stays separate from the companion operator for personal setups. Native Codex subagents do not automatically inherit capital; our explicit spawn workflow creates a separate worker, ENS node and vault.
7. **MCP live proof:** open [the public MCP guide](https://agent-capital-tree-silk.vercel.app/mcp) without selecting a vault. On a Judge laptop, clone the `work/rami` branch and run its read-only commands. `pnpm mcp:verify` installs the plugin into a temporary Codex profile, discovers 16 tools, and reads current USDC root state on Sepolia without a key or our laptops. It does not exercise a financial write. Do not present the Linux companion or native Windows writes as cross-platform verified.

Source entry points:

- ENS roles/registries: `contracts/src/ens/FinanceRoles.sol`, `contracts/src/ens/ManagedRegistry.sol`.
- Inherited authority and payment checks: `contracts/src/CapitalController.sol` (`_authorize`, `checkPayment`).
- Exact ERC-1271 payment verifier and Uniswap custody: `contracts/src/CapitalVault.sol`.
- HTTP402 purchase, retry journal and independent receipts: `packages/runtime/src/payments.ts`.
- Scoped identities and isolated worker dispatch: `packages/runtime/src/companion.ts`.
- MultiBaas query/receipt verification: `packages/multibaas/src/index.ts`.

Do not replay completed public financial runners or recover the live demo seed during a read-only presentation. The fork runner safely exercises revocation and recovery without public writes. Amount ceilings are per action; physical vault balances bound total spending. The service allowlist lives in the companion, not in onchain recipient policy. No audit, independent external-machine onboarding, automatic strategy discovery or guaranteed original-dollar recovery is claimed.

Uniswap’s feedback form and the ETHGlobal entry have not been submitted. Team/contact details and an explicit submission instruction are still required.
