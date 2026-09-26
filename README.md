# Agent Capital Tree

Give agents their own capital, delegate smaller amounts to sub-agents, and enforce narrower permissions at every level of the tree.

Agent Capital Tree combines **ENSv2 Enhanced Access Control**, separate onchain vaults, isolated agent workers, and **Curvegrid MultiBaas** activity indexing. **Uniswap v4** is the implemented application for bounded swaps and liquidity management. Payments and service purchases are future extensions.

[Open dashboard](https://agent-capital-tree.vercel.app) · [Inspect an agent tree](https://agent-capital-tree.vercel.app/tree?root=5) · [Five-minute jury walkthrough](docs/jury-demo.md) · [Acceptance evidence](ACCEPTANCE.md)

**Status — 26 September 2026:** deployed on Ethereum Sepolia, with real browser-wallet, agent-model, Uniswap and MultiBaas evidence. The redesigned dashboard is published and tested. Independent external-user onboarding and the remaining acceptance gates below are still open. This is an unaudited hackathon implementation; demo tokens have no monetary value.

## How it works

1. A human funds a root vault and authorizes a master agent.
2. The master transfers part of its available capital into a child's separate vault. Children can delegate again within the supported three-level tree.
3. ENSv2 EAC supplies the actual roles. Our controller checks the ancestor chain and enforces inherited policies; descendants cannot broaden their mandates.
4. Isolated workers use distinct keys to perform permitted actions. A child cannot spend its parent's or sibling's balance.
5. Parents can restrict or revoke branches. The human retains an independent recovery path for remaining assets, including closing existing LP positions.

Capital is actually transferred between vaults, not merely labeled with a budget. Per-action limits are distinct from cumulative spending limits. Model intelligence is not a security boundary, and recovery does not guarantee the original dollar value.

Tasks originate in Codex through the plugin/MCP integration. The dashboard shows onchain authority and supports owner wallet actions; an active mandate does not prove that an agent process is running.

## Explore the dashboard

The interface uses a shadcn/ui sidebar, readable typography, desktop/mobile layouts, and your system's light/dark preference. Navigation preserves the selected root. Selecting an agent opens its ENS identity, capital, permissions and inherited limits.

| Page | What to inspect |
| --- | --- |
| [Overview](https://agent-capital-tree.vercel.app/?root=5) | Capital totals, root status and next steps |
| [Agent tree](https://agent-capital-tree.vercel.app/tree?root=5) | Real parent/child relationships and selectable agent details |
| [Activity](https://agent-capital-tree.vercel.app/activity?root=9) | Indexed capital movements, coverage status and verified transaction links |
| [Applications](https://agent-capital-tree.vercel.app/applications?root=1) | Bounded Uniswap swaps and vault-owned liquidity |
| [Setup & control](https://agent-capital-tree.vercel.app/setup?root=5) | Wallet management, owner recovery and plugin/runtime instructions |

No wallet or model credential is needed to inspect the public demo. [Preview mode](https://agent-capital-tree.vercel.app/tree?preview=1) contains explicitly labeled illustrative records.

**Demo roots:** root 1 preserves funded seed liquidity. Roots 2, 5 and 9 are permanently revoked and empty after completed recovery tests. Root 5 retains its real four-node hierarchy; root 9 has 14 indexed events verified against Sepolia receipts. Use a new root for new agent tasks. Do not replay completed funding, spawning or recovery runners, or modify the seed during a read-only demo.

## Partner integrations

| Partner | Implemented contribution | Source and evidence |
| --- | --- | --- |
| ENS | Real nested ENSv2 registries and EAC roles; controller-enforced ancestor policies | [ManagedRegistry](contracts/src/ens/ManagedRegistry.sol), [CapitalController](contracts/src/CapitalController.sol) |
| Uniswap | Typed v4 swaps, vault-owned position NFT, separate LP management/fee/exit roles and owner recovery | [CapitalVault](contracts/src/CapitalVault.sol), [model execution](deployments/root-codex-e2e.json), [FEEDBACK.md](FEEDBACK.md) |
| Curvegrid | MultiBaas event queries and receipt enrichment, consumed by the dashboard and master-agent MCP tool | [Adapter](packages/multibaas), [master reallocation](deployments/multibaas-master.json), [integration experience](docs/multibaas-plan-limits.md) |

ENS supplies roles; numerical policy inheritance is enforced by our contracts rather than stored as descriptive metadata. MultiBaas provides history, not authorization. Current balances and permissions are read directly from Sepolia; indexed events are independently verified against canonical receipts.

The free MultiBaas plan permits only a 100-block historical backfill. Our coverage starts at block **11783944**, after root 5 was created. Root 9 demonstrates the indexed flow: an actual Sol master read history and current state, reclaimed 1 ACT-A from a child, and allocated 0.5 ACT-A to its sibling. This was a directed conditional task, not autonomous strategy discovery.

## Run locally

Use **Node.js 22**, **pnpm 11.13.1**, and **Foundry 1.8.3** for contract work. Dependency install scripts are disabled.

```sh
git clone --recurse-submodules https://github.com/CodeByNikolas/agent-capital-tree.git
cd agent-capital-tree
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm typecheck
pnpm test
```

For an existing checkout, initialize dependencies with `git submodule update --init --recursive`. The [runtime guide](packages/runtime/README.md) covers Docker isolation, local operator setup, gas grants and CLIProxyAPI. The [plugin guide](packages/plugin/README.md) covers Codex installation and MCP configuration. Agent execution requires your own reachable CLIProxyAPI endpoint, credential and available model; a Codex login alone is not sufficient. Wallet ownership and model access are separate.

For a private MultiBaas data key, run `bash scripts/configure-multibaas.sh` in your own interactive terminal. It stores the key outside the repository with owner-only permissions. Contract registration needs separate administrative setup; a view-only key does not grant it. Keep keys, seed phrases, provider credentials and private runtime data outside Git.

## Verification

The published redesign passed all five routes on desktop (1440px) and mobile (390px), in light and dark mode. Checks cover sidebar navigation, keyboard detail selection and focus return, text size/contrast, tree geometry, mobile history, invalid roots and browser errors. [Screenshots and reports](artifacts/ui) record the actual public URL and test time.

```sh
# Contracts and a disposable local Sepolia fork; Foundry must be on PATH.
bash contracts/scripts/test-contracts.sh
ACT_ANVIL_BIN="$(command -v anvil)" node scripts/test-sepolia-fork.mjs

# Public UI/API checks; no signatures or public transactions.
ACT_TEST_APP_URL=https://agent-capital-tree.vercel.app node scripts/test-web-smoke.mjs
ACT_TEST_APP_URL=https://agent-capital-tree.vercel.app node scripts/test-web-guardrails.mjs
```

The fork runner needs Sepolia RPC access and built workspace packages. The guardrail runner uses a **keyless EIP-1193 stub** to check account/network restrictions, stale-state blocking and an injected history outage. It does not replace real MetaMask testing.

| Completed evidence | Report |
| --- | --- |
| Fresh MetaMask owner creates/funds root 5 and binds its operator | [Owner setup](deployments/browser-owner-e2e.json) |
| Real master → child → grandchild model execution, swaps and full LP lifecycle | [Codex/model run](deployments/root-codex-e2e.json) |
| Restart/idempotency, revoked-branch isolation and usable sibling | [Follow-up](deployments/browser-tree-followup.json) |
| Browser owner closes LP and recovers all remaining root 5 assets | [LP closure](deployments/browser-owner-close.json), [recovery](deployments/browser-owner-recovery.json), [final state](deployments/browser-final-state.json) |
| Live MultiBaas-informed model reallocation and full root 9 recovery | [Master run](deployments/multibaas-master.json), [final state](deployments/multibaas-master-final-state.json) |
| Build, types, package tests, contracts and transaction journal | [GitHub Actions](https://github.com/CodeByNikolas/agent-capital-tree/actions) |

## Deployment and remaining acceptance

Network: **Ethereum Sepolia**, chain ID **11155111**. The [deployment manifest](deployments/sepolia.json) records public contract addresses and protocol versions. The [controller](https://sepolia.etherscan.io/address/0x55caFFf719B5FA70c0e8942eEe2C7EE6B8c7Db6b) is attached beneath `agentcapitaltree.eth`. Root 1 holds seed v4 NFT `39811`; it is not a user's personal vault.

The following boundaries remain explicit:

- Independent external-user/machine onboarding with its own model access has not been demonstrated.
- Native marketplace plugin installation and reads passed. Financial writes are proven through direct MCP registration with a 300-second timeout; marketplace-installed financial writes remain untested.
- Injected API failures and indexer-independent recovery have evidence; a deliberately induced real Curvegrid outage during recovery does not.
- The last real wallet provisioning needed a restart. The setup helper now checks the actual account before recording readiness, but fresh real provisioning was not repeated for that fix.
- The Uniswap feedback form and ETHGlobal entry have not been submitted. Team/contact details and authorization to send remain outstanding.

[PLAN.md](PLAN.md) contains the specification, [STATUS.md](STATUS.md) records progress, and [ACCEPTANCE.md](ACCEPTANCE.md) maps each requirement to its evidence and limits. The [jury walkthrough](docs/jury-demo.md) links directly to the implemented sponsor features.
