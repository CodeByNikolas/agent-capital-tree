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

Bounded swap implementation and local tests are integrated. Full local LP lifecycle work, canonical receipt evidence on Sepolia, and the browser/plugin acceptance workflow are still being completed. No mainnet safety or audited-custody claim is made.

## Submission

The required [Uniswap Developer Feedback Form](https://developers.uniswap.org/hackathon-feedback) still needs to be submitted with this file's public GitHub URL after the implementation and feedback are final.
