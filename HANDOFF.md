# Kanoki — release handoff

Updated 27 September 2026. Read [PLAN.md](PLAN.md) for current product decisions and the latest [STATUS.md](STATUS.md) entries for evidence. Earlier dated entries describe their original deployments.

## Published baseline

- Work on `main`; preserve concurrent edits and unique worktree/branch history.
- Production: **https://kanoki-app.vercel.app/**. Source `8e50f9f` is deployed as `dpl_9ZT2SeFt6FmSPjM7o3XhyE7KjtGF`, READY. Later documentation-only commits need not change the frontend build.
- The local Vercel link was verified for project `agent-capital-tree`, team `tumblockchains-projects`. Deployment is possible from this checkout; Git push alone does not deploy. Use the [release checklist](docs/release-checklist.md).
- Current ENSv2 Sepolia namespace: `kanoki.eth`. Controller: `0xeB2041B486D66aB91140FFcF54B66513D8eC40c8`. This is not ownership of the mainnet ENS name.
- `capital.kanoki.eth`, root 1, contains five vaults: Capital, Researcher, Trader, Liquidity and Risk check (under Trader). Root and Liquidity own LP NFTs 39889 and 39890. Current proof: [demo E2E](deployments/kanoki-demo-e2e.json), [x402 settlement](deployments/kanoki-payment.json).
- Default installed capital MCP: 19 tools and automatic persisted wallet onboarding. Separate modes: three-tool keyless reader and 17-tool configured worker bridge. Child vault creation does not launch an autonomous model worker.
- Wallet address opens Sign out/explorer controls. App sign-out survives reloads. Onboarding links to the live demo; How it works is on Overview. Shared sidebar/header persist across navigation; header stays visible while scrolling.

## Completed checks and remaining work

The latest release passed 38 contract tests, 71 workspace tests, production build/TypeScript, live MCP reads and desktop/mobile browser checks on the published app. The real demo exercises nested allocation, x402 settlement and idempotent retry, Uniswap swap, LP opening/fee collection, tightened limits and rejected unauthorized calls. All new controller transactions appear in MultiBaas; USDC settlements use separate verified receipts.

Remaining acceptance is scoped in [ACCEPTANCE.md](ACCEPTANCE.md): fresh external-machine wallet onboarding, marketplace-installed financial writes, desktop/Claude Code financial flows, native macOS signing and ChatGPT-login financial E2E. The earlier native API-key worker proof is historical, from another controller; no new autonomous worker was launched for the Kanoki demo. Controlled UI error tests do not prove a deliberately induced live MultiBaas outage.

The user reported submitting the Uniswap feedback form and reported that it did not request a URL. Team details are in [TEAM.md](TEAM.md) and README. ETHGlobal entry, partner selection and submission receipts still need independent confirmation; deployment is not submission.

## Continuation boundaries

Inspect live state and transaction journals before any new financial test. Completed seed, payment and demo runners are not presentation commands. Historical prototype roots, including revoked `root-agent.agentcapitalusdc.eth`, are excluded from the current dashboard/MCP; numeric root IDs alone do not identify a deployment.

Keep private keys, credentials, profiles and transcripts outside Git. Preserve other contributors' files and worktrees. Show MCP graphics using their returned image links or supplied Mermaid fallback. For deployment steps and read-only verification commands, use the release checklist.
