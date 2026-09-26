# Uniswap developer feedback — Agent Capital Tree

Implemented on Ethereum Sepolia with testnet and browser evidence. This records actual integration work; it is not confirmation that the feedback form or hackathon submission has been sent.

## Integration

Agents receive separate ENSv2-authorized vaults. Each vault is restricted to official Circle Sepolia Test-USDC, a valueless six-decimal DEMO-USD quote, and one fixed v4 pool. Its controller checks inherited policy and current authority before allowing a typed swap or LP action. The vault owns its PositionManager NFT and keeps all outputs; an agent cannot supply arbitrary router commands or redirect recipients.

The useful distinction is between permission to manage liquidity, permission to collect fees, and permission to close the position. Revoking management does not remove market exposure. A separate owner recovery path must work even if the ENS namespace or the agent runtime becomes unavailable.

Source: [CapitalController](contracts/src/CapitalController.sol), [CapitalVault](contracts/src/CapitalVault.sol), [fixed pool parameters](contracts/src/uniswap/FixedPool.sol). Final deployment receipts and acceptance status are tracked in [deployments/usdc-sepolia.json](deployments/usdc-sepolia.json) and [STATUS.md](STATUS.md).

## Findings so far

- The typed PoolManager and PositionManager interfaces let us keep authorization at the vault boundary without a custom hook. A hook's caller would otherwise not necessarily identify the originating agent.
- PositionManager's action encoding is powerful; an application with delegated financial authority should expose a small typed subset. Arbitrary action bytes would defeat our fixed recipient/pool constraints.
- Fees can offset funding during an increase. A vault balance difference records net token spending, not gross new principal. UI and event consumers must use matching terminology.
- Fee collection uses a zero-liquidity increase with settlement to the vault. This needs a lifecycle test that proves liquidity is unchanged; a method name alone is insufficient evidence.
- Deployments and source versions must be pinned together. The Sepolia PositionManager's PoolManager and Permit2 getters have been checked against the intended addresses. Our factory also rejects mismatched links.

## Validation status

The current vaults are non-upgradeable EIP-1167 clones. All 38 contract tests pass, including swaps and the full LP lifecycle through proxy custody. The Circle Sepolia fork additionally verifies x402 signatures and owner recovery through clones. The current Kanoki root owns LP NFT 39889; its Liquidity child owns NFT 39890. The five-vault demo also records a Trader swap and fee collection: [current E2E evidence](deployments/kanoki-demo-e2e.json). Full child-spawn gas decreased from 5,914,316 to 3,556,781 (39.86%); ENS registries remain separate full deployments. [Gas receipts](deployments/usdc-proxy-gas.json) and the current manifest provide the onchain evidence and Etherscan verification links.

An earlier USDC/DEMO-USD deployment passed a local Sepolia fork with pool initialization, LP opening/closure, x402 payment and complete remaining-capital recovery. Closing the LP left1rawUSDC unit of rounding dust. [Historical fork evidence](deployments/usdc-x402-fork.json) records exact outcomes; current public deployment status is in STATUS.md.

The following reports document the earlier ACT-token implementation, not a compatibility mode in the current UI:

The staged Foundry suite passes all 25 tests, including 256 fuzz cases, a real local v4 mint–increase–collect–burn cycle and ENS-independent owner recovery. A disposable Sepolia fork at block 11781277 additionally passed runtime swap/LP actions against the deployed PoolManager, PositionManager and actual Permit2, followed by owner close and complete recovery.

On public Sepolia, the system is deployed and the fixed pool is initialized and funded. [Transaction 0xa134…5cae](https://sepolia.etherscan.io/tx/0xa1346500298696129295da600e236d1d47acd649f65c2a6be30d9f7f04d55cae) opens vault-owned NFT 39811 with 5000e18 liquidity.

A separate real-model run created root 2, child 3 and grandchild 4 through the bundled MCP server and isolated workers. The child swapped, opened and increased NFT 39812, collected fees, and delegated a smaller swap-only mandate to the grandchild. After subtree revocation and runtime shutdown, the independent owner closed that LP and recovered every remaining token through the vault hierarchy. [The evidence report](deployments/runtime-e2e.json) records 23 canonical controller events and direct calls rejecting both revoked agents with `Inactive()`. This run used programmatic owner signing; full independent browser/plugin onboarding acceptance is still open. No mainnet safety or audited-custody claim is made.

## Submission

The later [Root5 Codex run](deployments/root-codex-e2e.json) demonstrates swap, LP opening/increase, nonzero fee collection and delegated sub-agents. The published app and MetaMask then performed [owner LP closure](deployments/browser-owner-close.json) and [complete owner recovery](deployments/browser-owner-recovery.json). All four Root5 vaults are revoked and empty, with the seed pool preserved. These are separate real model and browser flows; independent external-user onboarding remains unproven. The [demo guide](docs/jury-demo.md) provides source-line links and a read-only walkthrough.

The user reported submitting the [Uniswap Developer Feedback Form](https://developers.uniswap.org/hackathon-feedback); the form did not request a URL. This public FEEDBACK.md remains available for reviewers. Form submission is user-reported; ETHGlobal entry/partner selection are separate and still need confirmation.
