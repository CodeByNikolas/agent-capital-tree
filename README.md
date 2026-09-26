# Agent Capital Tree

Give agents capital, delegate smaller amounts to sub-agents, and enforce narrower permissions down the tree.

**ENSv2 Enhanced Access Control** supplies the roles. Separate vaults bound each agent’s available funds. **Uniswap v4** enables bounded swaps and liquidity positions; **x402** enables service purchases with official Circle **USDC**. **Curvegrid MultiBaas** indexes the controller’s capital and strategy events.

[Dashboard](https://agent-capital-tree.vercel.app) · [Live USDC tree](https://agent-capital-tree.vercel.app/tree?vault=capital.agentcapitalvault.eth) · [Local companion and MCP setup](docs/local-setup.md) · [Current status](STATUS.md) · [Jury walkthrough](docs/jury-demo.md)

The prototype targets **Ethereum Sepolia, chain 11155111**. The current release switches directly to the USDC deployment: no legacy deployment selector, old-link support or migration layer. Public contract addresses and deployment progress are recorded in [usdc-sepolia.json](deployments/usdc-sepolia.json). This is an unaudited hackathon prototype using testnet assets.

## How it works

1. A human creates and funds a root vault, then authorizes a master-agent operator.
2. The master transfers part of its capital into a child vault. Children may delegate again within a three-level tree.
3. Each node has a real ENS subname and EAC roles. Our controller explicitly checks ancestor policies, current authority, expiry and revocation.
4. Each runtime worker has its own key, workspace and authenticated MCP context in a separate Docker container. Model-supplied IDs cannot select a parent’s signer.
5. The human retains an independent recovery path for remaining assets, including closing existing LP positions.

Capital allocation is an actual transfer, not an overbookable allowance. Amount ceilings are **per action**, not cumulative spending limits. The vault’s allocated balance bounds total exposure. Model intelligence is not a security boundary; recovery does not guarantee the original dollar value.

Vaults are **non-upgradeable EIP-1167 proxies**: every root and child has a separate 45-byte contract, token balances and LP state, with one shared immutable implementation. VaultFactory deploys and initializes the controller binding in the same transaction; the implementation and initialized clones reject reinitialization. ENS registries are still deployed individually. Proxy deployment saves gas; calls incur a small delegation overhead. Existing full vaults cannot be converted in place.

The public researcher spawn used **3,556,781 gas**, down from **5,914,316** for its full-vault predecessor (**39.86% less**), including the ENS registry and capital allocation. [Both receipts](deployments/usdc-proxy-gas.json) document the comparison.

Native Codex subagents do not automatically become capital workers. Agents use our MCP `spawnChild` workflow; no automatic Codex hooks are enabled.

## Applications

**Service purchases:** `getPaymentServices` lists explicitly configured services. `purchaseService` follows x402 v2’s HTTP402 flow. The agent signs an exact EIP-3009 authorization for its vault, recipient, amount, validity window and nonce. The vault’s ERC-1271 verifier checks the current ENS/PAY mandate at settlement. Nonces bind the authority generation, and retries retain the same authorization. The companion independently verifies Circle’s `Transfer` and `AuthorizationUsed` receipt events.

The supported payment token is Circle Sepolia USDC at [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/token/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238), with six decimals. `10000` raw units is **0.01 USDC**. Obtain test tokens from [Circle’s faucet](https://faucet.circle.com/); the app cannot mint Circle USDC.

The x402 facilitator submits the signed authorization and pays settlement gas. USDC moves from the agent vault to the service provider. The agent can sign this payment without holding ETH; direct controller transactions such as delegation and swaps still require ETH in the transaction sender's wallet. The vault itself does not need ETH.

**Uniswap:** typed swaps and vault-owned LP positions use one fixed v4 pool. Management, fee collection and exit are separate permissions. The quote token is **DEMO-USD**, a clearly valueless six-decimal demo asset. Its pool price is not a real USD valuation. Agents cannot supply arbitrary router commands or redirect outputs.

**Future work:** policy-checked generic contract transactions, cumulative/rolling spending budgets and cross-currency valuation are not implemented. A child cannot spend more tokens than its vault currently owns; "cumulative budget" here means a separate lifetime or rolling counter that would remain binding even after top-ups or trading proceeds.

## Dashboard

Six pages separate overview, agent tree, activity, Uniswap, payments and setup. A shadcn/ui sidebar, readable typography, mobile layouts and system light/dark themes keep navigation focused. Selecting a node opens its capital, ENS name and inherited permissions. A zero-USDC root links to Circle's faucet; funding still uses the owner wallet.

Enter a vault contract address or a registered name under **`agentcapitalvault.eth`** in **Open vault**. Internal numeric IDs are not accepted in this field. Without a selected vault, the app shows onboarding; illustrative data requires explicit preview mode. The preview root **Main agent** at `main.preview`, its addresses, and its small **USDC** sample balances are invented UI examples, not contracts or funds. Historical ACT-A/ACT-B vaults from an earlier controller still exist on Sepolia but are not supported by this USDC dashboard. An active mandate does not imply an agent process is running.

Current balances and permissions come directly from Sepolia. MultiBaas history covers controller-emitted capital/strategy events. The Payments page independently scans Circle USDC `AuthorizationUsed` events for this tree's vaults and verifies same-transaction transfers in successful receipts. It shows the scanned block range and explicitly flags truncated coverage. This proves token settlement, but chain receipts alone cannot prove x402 merchant intent or service delivery. Indexing delay and the actual controller-history coverage boundary remain visible.

## Partner integrations

| Partner | Contribution | Code |
| --- | --- | --- |
| ENS | Nested registries, real subnames, native EAC roles including PAY; contract-enforced ancestor restrictions | [ManagedRegistry](contracts/src/ens/ManagedRegistry.sol), [Controller](contracts/src/CapitalController.sol) |
| Uniswap | Fixed-pool v4 swaps, vault-owned PositionManager NFT, typed LP lifecycle and independent owner exit | [Swap authorization](contracts/src/CapitalController.sol#L383-L409), [vault swap](contracts/src/CapitalVault.sol#L192), [LP lifecycle](contracts/src/CapitalVault.sol#L253), [FEEDBACK.md](FEEDBACK.md) |
| Curvegrid | MultiBaas event queries, receipt enrichment and canonical RPC verification for UI and MCP | [Adapter](packages/multibaas), [plan limits](docs/multibaas-plan-limits.md) |

ENS roles are actual authorization, not descriptive text metadata. MultiBaas is an indexer, not an authorization service. Its free plan allows only a 100-block backfill; indexing is configured before new demo activity.

## Run and test

Use Node22, pnpm11.13.1, Docker and Foundry1.8.3. Follow the [complete setup guide](docs/local-setup.md) for wallet/operator separation, a private companion configuration, OpenAI API-key setup (preferred) and MCP registration. The default native worker path uses an OpenAI API key held by the host app-server, with ChatGPT/Codex login as an alternative; HomeBox CLIProxyAPI remains an optional explicit configuration. Docker workers remain network isolated and receive scoped finance tools, while the host owns inference authentication.

```sh
git clone --recurse-submodules https://github.com/CodeByNikolas/agent-capital-tree.git
cd agent-capital-tree
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm typecheck
pnpm test
bash contracts/scripts/test-contracts.sh
node scripts/test-usdc-fork.mjs --payments
```

The fork test uses the actual Circle proxy and deployed Uniswap contracts on a disposable local Sepolia fork. It checks delegation, signatures, inherited restrictions, revocation, x402 settlement, retry behavior, LP opening/closure and recovery. It does not send public transactions or override token balances. See [fork evidence](deployments/usdc-x402-fork.json) and [STATUS.md](STATUS.md) for the exact completed checks and current public acceptance.

Deployment runners require an Etherscan key in `ETHERSCAN_API_KEY` or the private file `~/.agent-capital-tree/etherscan-api-key`. They finish with explorer verification. `node scripts/verify-deployment.mjs` verifies the current implementation, factories, controller, project/child registries, quote token and all existing vault-proxy associations, without wallet access or onchain writes. Run it after additional dashboard/MCP-created roots or children. It submits standard JSON from the compiled artifact's exact settings and hash-checked sources; the key is never included in that submission's source code. Verification results are recorded in the deployment manifest.

The controlled x402 seller is loopback-only, charges 0.01 USDC, and uses the test owner as recipient. It demonstrates the real protocol; it is not an independent commercial merchant. The companion’s service allowlist is a runtime restriction, not an onchain merchant allowlist. Service content remains untrusted.

Earlier browser-wallet and real-model evidence is retained in [ACCEPTANCE.md](ACCEPTANCE.md) as historical verification, not as a supported legacy product. Native OpenAI API-key inference with `gpt-6-luna` / `high` passed funded MCP spawn, x402 payment and Uniswap swap on Sepolia ([evidence](deployments/jury-openai-native.json)). ChatGPT-login financial E2E, independent external-machine onboarding and native-marketplace financial writes remain unproven. The current USDC/x402 flow has its own evidence and should not be conflated with those earlier runs.

[PLAN.md](PLAN.md) records product decisions. [STATUS.md](STATUS.md) tracks completed deployment/tests and remaining work. [Submission requirements](docs/ethglobal-requirements.md) and [AI-use provenance](docs/ai-use.md) are documented for the team. The Uniswap feedback form and ETHGlobal submission still require team details and an explicit submission instruction.

Public Sepolia x402 proof: [`deployments/usdc-payment.json`](deployments/usdc-payment.json). A PAY-only researcher spent **0.01 official USDC** from its vault; retry did not charge again. [Settlement transaction](https://sepolia.etherscan.io/tx/0xfb4b340038034b5ad44a347af7d2c45951ed04adccb77935149997724a0a7f13). This was a controlled local seller, not an independent merchant or autonomous model run. Controller history is separately verified in [`deployments/usdc-multibaas.json`](deployments/usdc-multibaas.json).
