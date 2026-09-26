# x402 × ENS: mandate-bound agent payments

This module lets an agent in the capital tree **buy services over HTTP with x402**, settled in
real **Circle USDC on Sepolia**, where **ENS is both the payer's identity and the spend gate**.

It is the live replacement for the former "x402 service payments — *Future work*" placeholder.

## The idea (why ENS + x402 makes sense here)

Agent Capital Tree already gives every agent an on-chain identity and a bounded mandate through
ENSv2: each vault is a node named `…​.agentcapitaltree.eth`, and ENSv2 Enhanced Access Control
(EAC) roles + the node `Policy` decide what that agent may do. x402 is the missing verb —
*spend on a service* — and it maps onto that existing machinery cleanly:

1. **ENS = payer identity.** A payment carries the paying agent's derived ENS name
   (`<label>.…​.agentcapitaltree.eth`). The server re-derives it from the controller and binds
   it into the receipt, so a service knows *which* tree agent paid — not just an address.
2. **The ENS mandate = the spend gate.** A payment is only honoured when the payer is the agent
   bound to the node (`getNode(nodeId).agent`) and that mandate is still active (not expired /
   revoked). When USDC is a controller token, the on-chain per-action policy cap is enforced too.
   The same mandate that bounds swaps now bounds service purchases.
3. **USDC = the rail.** x402 is USDC-native. Settlement is a real USDC transfer on Sepolia,
   verified on-chain (a `Transfer(from → payTo, ≥ price)` log) before the resource is served.

So the three hackathon threads compose: **USDC** (currency) + **x402** (payment protocol) +
**ENS** (identity + mandate).

## What ships and works today (no redeploy required)

The human/agent path runs end to end against the *current* deployment, because settlement is a
direct USDC transfer from the connected agent wallet — it does not need the vault-token
migration.

- **Settlement asset:** Circle USDC on Sepolia `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
  (6 decimals) — `apps/web/src/lib/x402.ts`.
- **Catalog:** ENS-named services priced in USDC — `apps/web/src/lib/x402-catalog.ts`
  (recipient overridable with `X402_PAY_TO`, defaults to the project deployer wallet).
- **Endpoints:**
  - `GET /api/x402/services` — the public catalog.
  - `GET /api/x402/services/[id]` — the x402-protected resource: replies **HTTP 402** with the
    USDC payment requirements, or, when an `X-PAYMENT` header is present, verifies settlement +
    the agent mandate and serves the resource with an `X-PAYMENT-RESPONSE` receipt.
- **Verification** (`apps/web/src/lib/x402-verify.ts`): checks the payment envelope, confirms the
  on-chain USDC transfer, **replay-guards** each settlement tx, and binds the payer to their
  capital-tree ENS identity + active mandate (and the USDC policy cap once USDC is a controller
  token).
- **Client:** the **Agent Services** panel (`apps/web/src/components/x402-panel.tsx`, rendered on
  the Applications page) and the `payForService` wallet action
  (`apps/web/src/lib/use-wallet-actions.ts`), gated by `requireNodeAgent` so only the vault's ENS
  agent can spend under its mandate.

### Manual end-to-end test

1. Set `SEPOLIA_RPC_URL` (server) and, optionally, `X402_PAY_TO`.
2. Fund the agent wallet with a little **Sepolia USDC** from the Circle faucet
   (<https://faucet.circle.com>) — a purchase costs 0.10–0.50 USDC.
3. Open the app, load the seeded root, connect the wallet that is the selected node's `agent`.
4. Go to **Applications → Agent Services**, click **Pay … USDC** on a service.
5. Approve the USDC transfer; the panel resubmits with the `X-PAYMENT` proof and shows the
   unlocked content + a receipt linking to the settlement tx on `sepolia.etherscan.io`.

Expected negative cases: paying from a non-agent wallet → `payer_not_agent`; reusing a settlement
tx → `payment_replayed`; underpaying → `insufficient_amount`.

## Level 2 — vault-custodial, agent-autonomous (needs a controller redeploy)

Today the payment leaves the *agent's own wallet*. To make the spend leave the **vault** under
on-chain enforcement — and to let an **autonomous** (Codex/MCP) agent pay — add a payment verb to
the controller. This is code-complete in design but gated on the same redeploy blocker as the
USDC-as-token0 migration (deployer keystore + gas), so it is specified here rather than shipped:

- **New role bit** in `contracts/src/ens/FinanceRoles.sol`: `PAY = 1 << 68` (next free slot,
  keeping the 4-bit spacing), added to `ALL`; mirror it in `packages/sdk/src/policy.ts`
  (`financeRoles`) and include it in `packages/runtime/src/companion.ts` `currentAuthority`.
- **New controller function** `payService(uint256 nodeId, address payTo, uint256 amount, bytes32 operationKey)`:
  authorize like other actions (`_authorize(nodeId, FinanceRoles.PAY, msg.sender)` + ancestor
  `DELEGATE` chain), enforce the `Policy` cap via `_checkAmounts`, then transfer USDC from the
  node's `CapitalVault` to `payTo`, emitting `ServicePaid(rootId, nodeId, payTo, amount, operationKey)`.
  `operationKey` makes retries idempotent (as `spawnChild` does).
- **MCP tool** `payService` in `packages/plugin/src/tools.ts` (alphabetic name — the gateway
  regex `^/v1/tools/[A-Za-z]+$` forbids digits) + a handler in `packages/runtime/src/chain.ts`
  mirroring `allocateCapital`. Because the worker container is `--network none`, the x402 HTTP
  handshake runs in the trusted companion, not the worker sandbox.

With that in place the browser panel keeps working, and an autonomous agent can pay a service
directly from its vault, fully bounded by its ENS mandate.

## Relationship to "Sepolia USDC as the main currency"

x402 already makes **USDC the transacted currency for services**. Making USDC the vault's primary
token (token0) is the separate migration described in the branch plan — it requires redeploying
the immutable two-token controller with `[USDC, demoToken]`, a new Uniswap v4 pool, and
6-vs-18-decimal-aware pool seeding. Once done, `x402-verify.ts` automatically enforces the USDC
policy cap (it already looks for USDC among the controller tokens).

## Status & deferred work (2026-09-26)

**Shipped — ENS/EAC as a queryable trust layer (Phase A).** ENS/EAC is now the name-addressed
authority source, not internal plumbing:

- `authorityOf(client, nodeId)` (`packages/sdk/src/index.ts`) returns a live per-capability
  attestation from the same on-chain `checkAction` + effective-policy oracle that gates every action.
- Public `GET /api/authority?q=<name|vault|nodeId>` (`apps/web/src/app/api/authority/route.ts`,
  resolving via `apps/web/src/lib/resolve-node.ts`) lets a service or another agent verify a mandate
  by ENS name before trusting it. Live-verified against the seeded root
  (`demo-liquidity.agentcapitaltree.eth`).
- `x402-verify.ts` now routes the spend through `authorityOf` — rejects revoked/stale/expired
  mandates (closed a prior gap where a revoked-but-unexpired agent could still pay).

**Landed in source, not yet live — vault-custodial payments (Phase B contracts).** The Level-2
surface sketched above as `payService` was instead implemented via EIP-3009 + ERC-1271:
`CapitalController.checkPayment(...)` (binds the nonce's top 64 bits to the node generation),
`CapitalVault.isValidSignature` (reconstructs the `TransferWithAuthorization` digest and calls
`checkPayment`), and `FinanceRoles.PAY = 1<<68` (`KNOWN = ALL|PAY`). Tests live in
`contracts/test/CapitalController.t.sol` (see its `TestToken` EIP-3009 double); CI `contracts` is
green. This surface is **absent from the live ACT-A/ACT-B deployment** (`deployments/sepolia.json`),
which carries no USDC token — so the runtime `purchaseService` path (`packages/runtime/src/payments.ts`)
fails closed there.

### Deferred — blocked on the owner / external infra
1. **Redeploy a payment-enabled stack** with USDC as a controller token (the immutable
   controller/factory/vault set + a USDC-paired Uniswap v4 pool). Gated on the deployer
   keystore/gas — an on-chain deploy, owner's call.
2. **Stand up / register an Ethereum-Sepolia (`eip155:11155111`) x402 facilitator** — the hosted
   `x402.org` facilitator lists only Base Sepolia (`docs/usdc-x402-feasibility.md`).
3. After (1)+(2): repoint the runtime at the new deployment and confirm an end-to-end vault-custodial
   purchase (`AuthorizationUsed` + `Transfer(vault→payTo)` on-chain).

### Deferred — optional, ready to implement (no redeploy blocker)
4. **Activate the PAY gate** in `x402-verify.ts` (the prepared one-liner) behind a
   "payment-enabled deployment" flag — harmless on the current deployment, enforcing once USDC is a
   controller token.
5. **Surface `/api/authority`** in the dashboard node panel (show live EAC capabilities per agent
   from the trust layer, not just the stored policy).
6. **Idea 1 — real name resolution:** a wildcard offchain resolver (ENSIP-10 + CCIP-Read) for
   `*.agentcapitaltree.eth` + reverse/primary names, so external tools resolve name → vault/agent and
   then call the authority view. `ManagedRegistry.register` already forwards a `resolver` arg the
   controller currently passes as `address(0)`. Check the wiring against the pinned ENSv2 commit
   `48b3e2d`.
7. **Idea 2 — metadata resolver:** a separate, agent-writable resolver for strategy/model/risk as ENS
   text records, keeping the locked authority names untouched.
