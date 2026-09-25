# Agent Capital Tree

Scoped capital and permissions for agent teams: ENSv2-authorized vaults, bounded Uniswap v4 strategies, and a shared activity view powered by Curvegrid MultiBaas.

**Development status:** the ENSv2 namespace, capital controller, demo tokens and funded Uniswap v4 pool are deployed on Ethereum Sepolia. The [public dashboard](https://agent-capital-tree.vercel.app) reads live balances, permissions and LP positions. Desktop/mobile browser and API checks pass against the published app. Live MultiBaas access and full published-wallet/plugin acceptance remain in progress. This is an unaudited hackathon implementation; demo assets have no monetary value.

## What we are building

- A human funds a root vault and authorizes a master agent.
- Each child receives a separate vault, real capital, and narrower inherited restrictions.
- ENSv2 Enhanced Access Control authorizes operations; vault contracts enforce balances, policy inheritance, and revocation.
- Workers can perform bounded swaps and manage a fixed Uniswap v4 LP position.
- Parents can revoke branches; the human retains an independent emergency exit.
- MultiBaas indexes confirmed activity for the dashboard and the master agent.

Tasks originate in Codex through our plugin. The dashboard explains the live capital tree and supports owner wallet actions. Worker keys are isolated from parent and sibling keys.

## Development

Use Node.js 22 and pnpm 11.13.1. Dependency install scripts are disabled.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm typecheck
pnpm test
```

Run `bash contracts/scripts/test-contracts.sh` with Foundry 1.8.3 on PATH for the staged Solidity build and 25 contract tests. `node scripts/test-sepolia-fork.mjs` checks actual Sepolia protocol code on a disposable local fork; it sends no transactions to public Sepolia. Both require the initialized Git submodules and built workspace packages. See [PLAN.md](PLAN.md) for the specification and [STATUS.md](STATUS.md) for actual progress and unresolved gates.

The [runtime guide](packages/runtime/README.md) covers isolated Docker workers, local operator setup, gas grants and CLIProxyAPI. The [plugin guide](packages/plugin/README.md) covers the local Codex integration. Wallet ownership and agent execution are separate: the website does not need model credentials.

Open the default dashboard for the funded seed root, or [root 2](https://agent-capital-tree.vercel.app/?root=2) for the recovered three-level test tree. Root 2 is permanently revoked; its empty vaults demonstrate the completed owner recovery. [Sample preview](https://agent-capital-tree.vercel.app/?preview=1) is explicitly illustrative. Reproduce read-only UI/API checks with `ACT_TEST_APP_URL=https://agent-capital-tree.vercel.app node scripts/test-web-smoke.mjs`; sanitized screenshots and the latest report are in [artifacts/ui](artifacts/ui).

For a private MultiBaas data key, run `bash scripts/configure-multibaas.sh` in your own interactive terminal. It stores a restricted DApp User key outside the repository with owner-only permissions. Never paste the key into chat. Contract registration requires separate administrative setup; the data key does not grant it.

## Testnet funding

Network: **Ethereum Sepolia**, chain ID **11155111**.

Deployment funding address: `0x280Ca099242D7164cD001E4479D59f13CD0ea7c9`.

Only public addresses are stored in [deployments/sepolia.json](deployments/sepolia.json). The local wallet utility creates encrypted keystores outside the repository. Never add private keys, seed phrases, passwords, or provider credentials to this project.

The [Sepolia controller](https://sepolia.etherscan.io/address/0x55caFFf719B5FA70c0e8942eEe2C7EE6B8c7Db6b) is attached beneath `agentcapitaltree.eth`. Root `1` provides persistent demo-pool liquidity. Its [opening transaction](https://sepolia.etherscan.io/tx/0xa1346500298696129295da600e236d1d47acd649f65c2a6be30d9f7f04d55cae) created vault-owned v4 NFT `39811`; it is not the user's own vault.

## Sponsor integration evidence

ENS authority is implemented in [ManagedRegistry](contracts/src/ens/ManagedRegistry.sol) and [CapitalController](contracts/src/CapitalController.sol). Bounded Uniswap actions live in [CapitalVault](contracts/src/CapitalVault.sol); [FEEDBACK.md](FEEDBACK.md) records integration feedback and the outstanding form submission. [MultiBaas](packages/multibaas) reads indexed activity and can reconcile it against canonical receipts; live access is still pending. These implementation links do not imply that end-to-end acceptance is complete. Independent wallet/plugin onboarding and deployed-browser tests are release requirements.
