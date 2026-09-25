# Agent Capital Tree

Scoped capital and permissions for agent teams: ENSv2-authorized vaults, bounded Uniswap v4 strategies, and a shared activity view powered by Curvegrid MultiBaas.

**Development status:** implementation in progress on Ethereum Sepolia. A [public preview](https://agent-capital-tree.vercel.app) is deployed. The ENS namespace and demo tokens are on Sepolia; the final controller and live integrations are still in progress. This repository does not currently provide an audited custody product. Demo assets have no monetary value.

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

Packages, contract instructions, tested deployment addresses and installation steps are added as each feature is implemented. See [PLAN.md](PLAN.md) for the complete specification and [STATUS.md](STATUS.md) for actual progress and unresolved gates.

For a private MultiBaas data key, run `bash scripts/configure-multibaas.sh` in your own interactive terminal. It stores a restricted DApp User key outside the repository with owner-only permissions. Never paste the key into chat. Contract registration requires separate administrative setup; the data key does not grant it.

## Testnet funding

Network: **Ethereum Sepolia**, chain ID **11155111**.

Deployment funding address: `0x280Ca099242D7164cD001E4479D59f13CD0ea7c9`.

Only public addresses are stored in [deployments/sepolia.json](deployments/sepolia.json). The local wallet utility creates encrypted keystores outside the repository. Never add private keys, seed phrases, passwords, or provider credentials to this project.

## Sponsor integration evidence

ENS authority is implemented in [ManagedRegistry](contracts/src/ens/ManagedRegistry.sol) and [CapitalController](contracts/src/CapitalController.sol). Bounded Uniswap actions live in [CapitalVault](contracts/src/CapitalVault.sol); [FEEDBACK.md](FEEDBACK.md) records integration feedback and the outstanding form submission. [MultiBaas](packages/multibaas) reads indexed activity and can reconcile it against canonical receipts; live access is still pending. These implementation links do not imply that end-to-end acceptance is complete. Independent wallet/plugin onboarding and deployed-browser tests are release requirements.
