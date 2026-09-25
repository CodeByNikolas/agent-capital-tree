# Uniswap developer feedback — Agent Capital Tree

Work in progress, Ethereum Sepolia. This records actual integration work; it is not confirmation that the feedback form or hackathon submission has been sent.

## Integration

Agents receive separate ENSv2-authorized vaults. Each vault is restricted to the same two valueless demo assets and one fixed v4 pool. Its controller checks inherited policy and current authority before allowing a typed swap or LP action. The vault owns its PositionManager NFT and keeps all outputs; an agent cannot supply arbitrary router commands or redirect recipients.

The useful distinction is between permission to manage liquidity, permission to collect fees, and permission to close the position. Revoking management does not remove market exposure. A separate owner recovery path must work even if the ENS namespace or the agent runtime becomes unavailable.

Source: [CapitalController](contracts/src/CapitalController.sol), [CapitalVault](contracts/src/CapitalVault.sol), [fixed pool parameters](contracts/src/uniswap/FixedPool.sol). Final deployment receipts and acceptance status are tracked in [deployments/sepolia.json](deployments/sepolia.json) and [STATUS.md](STATUS.md).

## Findings so far

- The typed PoolManager and PositionManager interfaces let us keep authorization at the vault boundary without a custom hook. A hook's caller would otherwise not necessarily identify the originating agent.
- PositionManager's action encoding is powerful; an application with delegated financial authority should expose a small typed subset. Arbitrary action bytes would defeat our fixed recipient/pool constraints.
- Fees can offset funding during an increase. A vault balance difference records net token spending, not gross new principal. UI and event consumers must use matching terminology.
- Fee collection uses a zero-liquidity increase with settlement to the vault. This needs a lifecycle test that proves liquidity is unchanged; a method name alone is insufficient evidence.
- Deployments and source versions must be pinned together. The Sepolia PositionManager's PoolManager and Permit2 getters have been checked against the intended addresses. Our factory also rejects mismatched links.

## Validation status

The staged Foundry suite passes all 25 tests, including 256 fuzz cases, a real local v4 mint–increase–collect–burn cycle and ENS-independent owner recovery. A disposable Sepolia fork at block 11781277 additionally passed runtime swap/LP actions against the deployed PoolManager, PositionManager and actual Permit2, followed by owner close and complete recovery.

On public Sepolia, the system is deployed and the fixed pool is initialized and funded. [Transaction 0xa134…5cae](https://sepolia.etherscan.io/tx/0xa1346500298696129295da600e236d1d47acd649f65c2a6be30d9f7f04d55cae) opens vault-owned NFT 39811 with 5000e18 liquidity.

A separate real-model run created root 2, child 3 and grandchild 4 through the bundled MCP server and isolated workers. The child swapped, opened and increased NFT 39812, collected fees, and delegated a smaller swap-only mandate to the grandchild. After subtree revocation and runtime shutdown, the independent owner closed that LP and recovered every remaining token through the vault hierarchy. [The evidence report](deployments/runtime-e2e.json) records 23 canonical controller events and direct calls rejecting both revoked agents with `Inactive()`. This run used programmatic owner signing; full independent browser/plugin onboarding acceptance is still open. No mainnet safety or audited-custody claim is made.

## Submission

The required [Uniswap Developer Feedback Form](https://developers.uniswap.org/hackathon-feedback) still needs to be submitted with this file's public GitHub URL after the implementation and feedback are final.
