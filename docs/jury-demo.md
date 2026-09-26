# Agent Capital Tree — demo guide

## Product in one sentence

Give each agent its own capital and a narrower mandate, while keeping the human owner's recovery path independent of agents, ENS availability and the activity indexer.

Capital is transferred into separate vaults. A child cannot spend a parent's balance. ENSv2 EAC supplies the current roles; the controller checks the ancestor chain and numerical constraints on every supported operation. Model intelligence is not a security boundary.

## Five-minute read-only demonstration

No wallet or model credential is needed to inspect these completed runs.

1. Open the [overview](https://agent-capital-tree.vercel.app/?root=5). Explain the difference between a vault's capital, its permissions, and an agent process. A valid mandate does not prove that a runtime is running.
2. Open the [agent tree](https://agent-capital-tree.vercel.app/tree?root=5). Inspect root5, child6, grandchild7 and sibling8. Select the grandchild to show its ENS name and constraints inherited from its ancestors. This real tree is now revoked and empty because the owner recovered all funds.
3. Open [Root9 activity](https://agent-capital-tree.vercel.app/activity?root=9). Show the actual master sequence: read indexed activity and current authority, reclaim1ACT-A from child10, then allocate0.5ACT-A to sibling11. Follow a receipt link. MultiBaas selects indexed activity; independent Sepolia receipt checks verify it. The displayed coverage boundary is real.
4. Open [applications for the seed root](https://agent-capital-tree.vercel.app/applications?root=1). Uniswap v4 is the implemented example: bounded swaps and vault-owned liquidity. Managing liquidity, collecting fees and exiting are distinct permissions. Revocation alone does not close a market position. Preserve this seed; do not recover or modify it during a read-only demo.
5. Open [setup](https://agent-capital-tree.vercel.app/setup?root=5) to show the wallet and plugin path. The owner uses an independent recovery operation; worker identities come from isolated runtime credentials and onchain authorization, not a model-supplied agent ID.

Payments and service purchases are potential adapters, not current contract functions. These demo tokens have no monetary value; there is no USD valuation or guaranteed return. [Preview mode](https://agent-capital-tree.vercel.app/tree?preview=1) is illustrative and explicitly labeled.

## Technical evidence for reviewers

| Partner | Contribution | Review starting point |
| --- | --- | --- |
| ENS | Actual ENSv2 permissioned registries and EAC roles, checked alongside the ancestor policy chain | [ManagedRegistry](../contracts/src/ens/ManagedRegistry.sol), [controller authorization](https://github.com/CodeByNikolas/agent-capital-tree/blob/acb8226/contracts/src/CapitalController.sol#L536) |
| Uniswap | Typed v4 swaps, vault-owned position NFT, distinct management/fee/exit roles and owner recovery | [swap](https://github.com/CodeByNikolas/agent-capital-tree/blob/acb8226/contracts/src/CapitalVault.sol#L67), [LP lifecycle](https://github.com/CodeByNikolas/agent-capital-tree/blob/acb8226/contracts/src/CapitalVault.sol#L128), [owner LP exit](https://github.com/CodeByNikolas/agent-capital-tree/blob/acb8226/contracts/src/CapitalController.sol#L443), [feedback](../FEEDBACK.md) |
| Curvegrid | MultiBaas event queries and receipt enrichment, consumed by the UI and master-agent MCP tool | [queries](https://github.com/CodeByNikolas/agent-capital-tree/blob/acb8226/packages/multibaas/src/index.ts#L154), [independent verification](https://github.com/CodeByNikolas/agent-capital-tree/blob/acb8226/packages/multibaas/src/index.ts#L633), [model reallocation proof](../deployments/multibaas-master.json) |

The [acceptance matrix](../ACCEPTANCE.md) distinguishes actual MetaMask transactions, programmatic owner actions, model actions, injected failures and read-only checks. Root9's complete indexed history starts after block11783944; Root5 predates the free-plan history boundary.

## Running a new agent task

Use a new root and a separate owner/operator. Do not restart retired roots2,5,9 or replay completed financial test scripts. Follow the [runtime guide](../packages/runtime/README.md) and [plugin guide](../packages/plugin/README.md). Required: Sepolia wallet/gas, Node22, pnpm, Docker, the pinned Codex binary and your own CLIProxyAPI model access. Keep all keys local and outside the repository.

The supported long-running financial path registers the bundled MCP server explicitly with a300-second timeout. A separate marketplace-install/read proof exists; marketplace-installed writes have not been verified. Independent external-user onboarding still needs a separate environment with its own credentials.

## Submission handoff

The repository, deployment and evidence are public. The Uniswap feedback form and ETHGlobal entry have not been submitted. The team must supply its submission account, team/contact details and authorization to send. Use the evidence above without claiming unsupported payments, autonomous strategy discovery, a security audit, or independent onboarding already completed.
