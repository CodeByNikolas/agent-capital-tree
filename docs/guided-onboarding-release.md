# Guided Kanoki onboarding release

Published on the canonical https://kanoki-app.vercel.app deployment. The current reviewed frontend build is `8e50f9f` (27 September 2026). Use [the release checklist](release-checklist.md) for the verified Vercel team/project and deployment command.

The default plugin starts the bundled capital MCP with 19 tools. New users ask it to prepare a vault, follow one wallet link, and return to chat. A private signer and generated name persist locally. After owner authorization, the MCP discovers the matching vault automatically, including after restart. No root ID, ENS copy, manual profile, runtime server or bearer token is required. Signing supports Linux and Windows/WSL2 with Node 22+.

The guided page discloses 0.10 Test-USDC and up to 0.01 Sepolia ETH for operator gas. Existing contracts require up to five separate wallet confirmations: create, authorize, approve, fund, gas. An owner can decline any confirmation. The browser journals progress, reconciles pending receipts and blocks ambiguous submissions rather than sending again. Aggregate tree capital determines funding shortfall. Completed funding stages are not repeated after later spending. No automatic operator replacement or owner-key import is allowed.

## Original onboarding verification — 26 September 2026

- Runtime focused Linux tests: 16 passed, including private signer persistence, restart attachment, mismatch and revoked-root rejection.
- Plugin tests: 22 passed. A fresh real Codex 0.157.0 marketplace installation registered 19 tools and read the live current Sepolia tree at block 11788940 without a runtime URL or bearer token.
- Guided wallet adapter checks passed: full transaction sequence, retry without refilling spent funds, pending-receipt recovery, ambiguous-send lock and operator mismatch.
- Production web build passed. Desktop 1280px and mobile 380px browser checks passed with a single setup action and no horizontal overflow. Screenshots are in `artifacts/ui/guided-setup-*.png`.
- No onchain transaction was submitted for these checks. No autonomous worker was started.

## Remaining acceptance

The simplified guided page has passed public desktop/mobile browser checks. Reconnect or reinstall Kanoki after upgrading the MCP. Complete owner-reviewed wallet setup, confirm `getCapitalSetup` reports the matching root/signer and sufficient gas, and then perform the expressly authorized child-vault test with stable operation keys. Record receipts, shared tree balances and retry results. This fresh-user signed onboarding test is still open; the completed [public demo E2E](../deployments/kanoki-demo-e2e.json) uses an existing root and does not close this gate; local mocks and live reads do not replace it. Historical revoked root 4 must not be reused or funded.
