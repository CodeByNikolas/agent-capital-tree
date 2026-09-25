# Agent Capital Tree

Scoped capital and permissions for agent teams: ENSv2-authorized vaults, bounded Uniswap v4 strategies, and a shared activity view designed for Curvegrid MultiBaas indexing.

**Development status:** the ENSv2 namespace, capital controller, demo tokens and funded Uniswap v4 pool are deployed on Ethereum Sepolia. The [public dashboard](https://agent-capital-tree.vercel.app) reads live balances, permissions and LP positions. Desktop/mobile browser and API checks pass against the published app. A fresh MetaMask owner created and funded root 5 and bound its operator; a separate Codex/model run created and operated its child and grandchild. Browser rejection, network-switch and stale-data checks also passed. Companion restart, sibling isolation and owner LP closure/recovery of descendants passed. Final root-to-owner recovery also passed; all four test vaults are revoked and empty. Live MultiBaas indexing and complete combined acceptance remain open. This is an unaudited hackathon implementation; demo assets have no monetary value.

## What we are building

- A human funds a root vault and authorizes a master agent.
- Each child receives a separate vault, real capital, and narrower inherited restrictions.
- ENSv2 Enhanced Access Control authorizes operations; vault contracts enforce balances, policy inheritance, and revocation.
- Workers can perform bounded swaps and manage a fixed Uniswap v4 LP position.
- Parents can revoke branches; the human retains an independent emergency exit.
- MultiBaas is intended to index confirmed activity for the dashboard and the master agent; live indexing is not yet configured.

Tasks originate in Codex through our plugin. The dashboard explains the live capital tree and supports owner wallet actions. Worker keys are isolated from parent and sibling keys.

## Development

Use Node.js 22 and pnpm 11.13.1. Dependency install scripts are disabled.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm typecheck
pnpm test
```

Run `bash contracts/scripts/test-contracts.sh` with Foundry 1.8.3 on PATH for the staged Solidity build and 25 contract tests. `node scripts/test-sepolia-fork.mjs` checks actual Sepolia protocol code on a disposable local fork; it sends no transactions to public Sepolia. Both require the initialized Git submodules and built workspace packages. See [PLAN.md](PLAN.md) for the specification and [STATUS.md](STATUS.md) for actual progress and unresolved gates. [ACCEPTANCE.md](ACCEPTANCE.md) maps every planned requirement to its evidence and remaining limitations.

The [runtime guide](packages/runtime/README.md) covers isolated Docker workers, local operator setup, gas grants and CLIProxyAPI. The [plugin guide](packages/plugin/README.md) covers the local Codex integration. Wallet ownership and agent execution are separate: the website does not need model credentials.

Open [live root 5](https://agent-capital-tree.vercel.app/?root=5) for the fresh browser-owner and Codex/model demonstration, the default dashboard for the funded seed root, or [root 2](https://agent-capital-tree.vercel.app/?root=2) for an earlier recovered three-level test tree. Roots 2 and 5 are permanently revoked and empty after their owner-recovery tests. Root 5 preserves the real four-node hierarchy for inspection; use a new root to run agents. The [sample preview](https://agent-capital-tree.vercel.app/?preview=1) uses illustrative records and is not a live root. Root 5 evidence is in the [owner setup](deployments/browser-owner-e2e.json), [Codex/model run](deployments/root-codex-e2e.json), and [browser negative-case report](deployments/browser-negative-cases.json). Reproduce read-only UI/API checks with `ACT_TEST_APP_URL=https://agent-capital-tree.vercel.app node scripts/test-web-smoke.mjs`; sanitized screenshots and the latest report are in [artifacts/ui](artifacts/ui).

For a private MultiBaas data key, run `bash scripts/configure-multibaas.sh` in your own interactive terminal. It stores a restricted DApp User key outside the repository with owner-only permissions. Never paste the key into chat. Contract registration requires separate administrative setup; the data key does not grant it.

## Testnet funding

Network: **Ethereum Sepolia**, chain ID **11155111**.

Deployment funding address: `0x280Ca099242D7164cD001E4479D59f13CD0ea7c9`.

Only public addresses are stored in [deployments/sepolia.json](deployments/sepolia.json). The local wallet utility creates encrypted keystores outside the repository. Never add private keys, seed phrases, passwords, or provider credentials to this project.

The [Sepolia controller](https://sepolia.etherscan.io/address/0x55caFFf719B5FA70c0e8942eEe2C7EE6B8c7Db6b) is attached beneath `agentcapitaltree.eth`. Root `1` provides persistent demo-pool liquidity. Its [opening transaction](https://sepolia.etherscan.io/tx/0xa1346500298696129295da600e236d1d47acd649f65c2a6be30d9f7f04d55cae) created vault-owned v4 NFT `39811`; it is not the user's own vault.

## Sponsor integration evidence

ENS authority is implemented in [ManagedRegistry](contracts/src/ens/ManagedRegistry.sol) and [CapitalController](contracts/src/CapitalController.sol). Bounded Uniswap actions live in [CapitalVault](contracts/src/CapitalVault.sol); [FEEDBACK.md](FEEDBACK.md) records integration feedback and the outstanding form submission. The [MultiBaas adapter](packages/multibaas) can read indexed activity and reconcile it against canonical receipts; live access is still pending. Root 5 has published-browser owner and Codex/model evidence, including confirmed LP fees, [restart/sibling isolation and programmatic capital reallocation](deployments/browser-tree-followup.json), and [browser owner LP closure](deployments/browser-owner-close.json). The [final browser recovery](deployments/browser-owner-recovery.json) and [independent final-state check](deployments/browser-final-state.json) passed: all four vaults are revoked and empty, with no open LP. The final wallet profile required an [onboarding restart](deployments/browser-recovery-profile.json); this is not evidence of flawless single-command wallet provisioning. Completed financial runners must not be replayed. Programmatic reallocation does not prove MultiBaas-informed master-model decisions. These implementation links and separate runs do not imply complete end-to-end acceptance.
