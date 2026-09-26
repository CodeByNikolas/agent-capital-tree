# Kanoki

Agent Capital Tree

The September 26 implementation brief and its corrections govern the app, documentation and MCP presentation. This file records the corrected project scope. The token values live in `apps/web/src/app/tokens.css` and are copied unchanged into the MCP visual bundle.

## Identity and scope

- Kanoki is the display name. Agent Capital Tree is the tagline. The root is an owner-funded vault. Funding uses the owner's wallet.
- Preserve contracts, events, ABIs, deployment manifests, package names, environment variables, scripts, the Vercel project and the `agentcapitalusdc.eth` namespace.
- Preserve every existing MCP tool name and schema. The manifest server name is `kanoki`. Role requirements prefix tool descriptions; all tools remain discoverable.
- Use root, node, vault, allocation, limit, remaining, delegate, revoke, capability and owner. The tree has at most three levels. Revocation stops management. Funds remain in the vault until an authorized recovery or exit.

## Presentation

- Dark is primary; light is an explicit option. Use only the supplied color, font, spacing and radius tokens. Depth comes from a line border and the raised surface.
- Moss indicates action and current authority. Gold identifies capital. Signal is reserved for revocation, exceeded limits and the specified unreachable index indicator.
- Use Fraunces for one display sentence per view, IBM Plex Sans for prose and IBM Plex Mono for amounts, ENS names, addresses, times and hashes. Use the brief's type scale; capability labels are the specified 11px exception.
- Amounts show six decimals and a unit. USDC uses `--gold-ink`. DEMO-USD is separate, muted and explicitly a test asset. Never add their balances together. Pool quotes state: "Test ratio, not a USD valuation."
- Use line borders and the supplied radius tokens. Hover/focus/state transitions take 150ms ease-out; node entry takes 200ms. Focus is a two-pixel gold outline.
- Navigation is Overview, Tree, Applications, Activity, Setup. Tree edges are orthogonal and run from parent above to child below. The desktop layout uses dagre; narrow layouts retain the same card structure.
- Every node shows all four capabilities: DELEGATE, SWAP, LIQUIDITY, PAY. Missing capabilities are dimmed. Disabled application actions remain visible. Revoke and Exit require confirmation describing their scope.
- Service settlement has one receipt; retries reuse it. Activity rows have separators, timestamps, node names, right-aligned amounts and transaction links, with truthful MultiBaas coverage.

## Brand assets

The supplied files are PNGs in `packages/export`: `kanoki-logo-512.png` and two cover sizes. Reference unchanged copies under `apps/web/public/brand`; use the mark at 24px in the header and in metadata. Replace these with the approved SVG variants when those files are supplied. Do not redraw the mark.

## MCP output

The first Markdown line is `**kanoki** · sepolia · <node>`. The status line orders USDC balance, the four capabilities (missing ones as `—`), expiry and status. Tree rows use a space-aligned code block with `◉` for the human root and `○` for agent nodes. ENS names, addresses and hashes in prose use backticks. Errors are normal tool results and state the actual failed rule. Full machine data remains in `structuredContent`; every result also retains its PNG, real image link and Mermaid fallback.

## Verification

Check both themes at 1280×720 and 380px width, text contrast, keyboard focus and responsive overflow. Check existing plugin tests, keyless MCP reads, names/schema parity and untouched contract/deployment files. Record actual evidence and remaining wallet/host limitations in `STATUS.md`. The README GIF is a recording of explicit preview mode, with no financial actions.
