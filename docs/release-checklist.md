# Canonical release checklist

The project owner publishes the final reviewed main commit to https://kanoki-app.vercel.app/. This machine lacks access. Do not reuse the checkout's existing `.vercel` link: it refers to the older project.

## Before deployment

- The kanoki.eth cutover is implemented in the current manifest. Confirm the deployed SHA includes controller `0xeB2041B486D66aB91140FFcF54B66513D8eC40c8`, namespace and current wallet setup URLs.
- Record the exact SHA and successful CI URL. CI covers workspace build/typecheck/tests, pinned Foundry checks and the retry journal.
- Use a clean checkout of that SHA. Select the Vercel project owning the canonical alias and verify its team and `apps/web` root directory. Preserve server-only environment settings without printing credentials.
- Use the repository's Vercel build configuration, including SDK/MultiBaas before Next.js. Do not assume a Git push automatically deploys.

## After deployment

- Record deployment ID, source SHA, alias and READY status in STATUS.md. HTTP 200 does not prove source identity.
- Check Overview, Agent tree, Activity, Curvegrid, Applications, Uniswap, x402 Pay, Setup and MCP guide at desktop/mobile widths and in both themes. Verify tour context, loading skeletons, no overflow and no browser errors.
- Resolve a live root through ENS/address lookup. Check separate USDC/DEMO-USD balances, capabilities, receipts and disclosed MultiBaas coverage. Sample screenshots are not financial evidence.
- The separate onboarding owner confirms root, signer, budget and wallet actions before writes. Keep financial acceptance separate from read-only smoke results.

## Open acceptance and submission

Independent-machine onboarding, marketplace-installed financial writes, desktop/Claude Code financial flows, native macOS signing, ChatGPT-login financial E2E and a deliberately induced live indexer outage remain open. ACCEPTANCE.md records completed native API-key and historical proofs with their limits.

Use README.md for product/partner links, TEAM.md for profiles, FEEDBACK.md for Uniswap feedback, deployments/usdc-sepolia.json for addresses (revalidate after namespace work), and ACCEPTANCE.md for scoped evidence. The README GIF is illustrative. Record actual ETHGlobal and feedback-form confirmation receipts; preparation is not submission.
