# Canonical release checklist

Current production is **https://kanoki-app.vercel.app/**, Vercel project `agent-capital-tree` in `tumblockchains-projects`. Source `7b7d9d1` was deployed on 27 September 2026 as `dpl_9YZCtpvvNpd8R5AgZFi8ro8ic14a` (READY), followed by passing public desktop/mobile checks.

## Before deployment

- Fetch `origin/main`, preserve concurrent changes and record the exact reviewed source SHA. Record CI results separately from local test results.
- Confirm the current manifest uses `kanoki.eth` and controller `0xeB2041B486D66aB91140FFcF54B66513D8eC40c8`.
- Run the relevant tests and production build. For a full workspace check use `pnpm test`, the contract test runner and `pnpm --filter @agent-capital-tree/web build`.
- Verify `.vercel/project.json`: project `prj_xo0ekeqkGXO6GZpj67bhrV8Rght6`, organization `team_TYHTje9o9E8h9GzmpO1Nhz3p`. Confirm the remote project still owns the canonical alias and uses `apps/web` as its root. Keep server credentials private.
- Use the existing Vercel build configuration (SDK/MultiBaas before Next.js). A Git push does not deploy this project automatically. When deployment is authorized, run from the repository root:

```sh
vercel deploy --prod --yes --scope tumblockchains-projects
```

## After deployment

Record deployment ID, build SHA, alias and READY status in STATUS.md. Verify the published build:

```sh
ACT_TEST_APP_URL=https://kanoki-app.vercel.app node scripts/test-background-refresh.mjs
ACT_TEST_APP_URL=https://kanoki-app.vercel.app node scripts/test-wallet-session.mjs
ACT_TEST_APP_URL=https://kanoki-app.vercel.app node scripts/test-dashboard-shell.mjs
ACT_TEST_APP_URL=https://kanoki-app.vercel.app node scripts/test-live-demo.mjs
```

These checks cover sign-out/reconnect, dashboard-only guidance, persistent navigation, sticky header, five real demo vaults, two LP positions, the x402 receipt and indexed controller evidence on desktop/mobile. Wallet-session checks use a controlled injected provider; the demo check reads real public APIs. None submits a financial transaction.

For wider UI changes, also run the nine-route skeleton/layout, tour and owner-filtering checks. Keep USDC and DEMO-USD separate and display the actual MultiBaas coverage; a lagging reported checkpoint does not imply that newer returned events are absent. Confirm fresh financial authorization before any separate signing test.

## Remaining acceptance and submission

See [ACCEPTANCE.md](../ACCEPTANCE.md) for current versus historical financial evidence and open external-machine/host checks. The user reported submitting the Uniswap feedback form (no URL field was required). ETHGlobal entry and partner selections have not been independently confirmed here. Use [TEAM.md](../TEAM.md), [FEEDBACK.md](../FEEDBACK.md) and [submission requirements](ethglobal-requirements.md); repository preparation is not proof of submission.
