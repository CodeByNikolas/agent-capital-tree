# Agent Capital Tree

Scoped capital and permissions for agent teams: ENSv2-authorized vaults, bounded Uniswap v4 strategies, and a shared activity view powered by Curvegrid MultiBaas.

**Development status:** implementation in progress on Ethereum Sepolia. Contracts and the public application are not deployed yet. This repository does not currently provide an audited custody product. Demo assets will have no monetary value.

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
pnpm typecheck
pnpm test
pnpm build
```

Packages, contract instructions, tested deployment addresses and installation steps are added as each feature is implemented. See [PLAN.md](PLAN.md) for the complete specification and [STATUS.md](STATUS.md) for actual progress and unresolved gates.

## Testnet funding

Network: **Ethereum Sepolia**, chain ID **11155111**.

Deployment funding address: `0x280Ca099242D7164cD001E4479D59f13CD0ea7c9`.

Only public addresses are stored in [deployments/sepolia.json](deployments/sepolia.json). The local wallet utility creates encrypted keystores outside the repository. Never add private keys, seed phrases, passwords, or provider credentials to this project.

## Sponsor integration evidence

Implementation links and transaction evidence will be added after the integrations work. ENSv2, Uniswap v4 and MultiBaas are planned integrations, not completed claims. Independent wallet/plugin onboarding and deployed-browser tests are release requirements.
