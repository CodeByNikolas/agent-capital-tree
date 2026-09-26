# Kanoki — release handoff

Updated 26 September 2026. Read PLAN.md and the latest STATUS.md entries first. Older entries retain historical evidence.

## Ownership and baseline

- Publish from `main` to **https://kanoki-app.vercel.app/**. The user assigned deployment to the project owner. This machine's Vercel account (`ramiezze`) sees only `raglibol`; do not deploy this release to the old silk alias.
- The user selected **kanoki.eth** for onboarding and confirmed another agent owns its implementation. Leave that agent's runtime, wallet, namespace and UI work intact. A requested name is not proof of an active root, deployed controller or wallet authorization.
- `fc7c63c` includes restored guides; `4da1bc7` includes unbound 23-tool MCP startup. Both are on remote main. [CI for fc7c63c passed](https://github.com/CodeByNikolas/agent-capital-tree/actions/runs/36273240439).
- The canonical website returned HTTP 200 and the Kanoki title. This does not establish its deployed source commit.
- Other agents still edit the primary checkout. Use a separate worktree; never stage, reset or discard their files.

## Remaining sequence

1. Finish and review the kanoki.eth implementation. Preserve explicit root selection, controller/root domain checks, wallet approval, revocation guards and private journals. Run Linux tests and a production build on the final commit.
2. The project owner deploys that exact main commit. Record source SHA, deployment ID and alias in STATUS.md; follow [the release checklist](docs/release-checklist.md).
3. Check the published routes, desktop/mobile, both themes, guides, ENS lookup, separate asset balances, receipts and index coverage. Preview GIFs are illustrative only.
4. The onboarding owner coordinates real wallet and capital MCP acceptance against the confirmed active root. Do not repeat completed seed/payment/worker transactions. No extra deposit or migration is authorized by this handoff.
5. Complete independent jury installation and marketplace financial writes. Desktop/Claude Code financial flows, native macOS signing, ChatGPT-login worker E2E and an intentionally induced live MultiBaas outage remain unverified. Native API-key worker payment/swap evidence is complete within its documented same-host scope.
6. Finish ETHGlobal and Uniswap feedback submissions once final release links are ready. Team details are complete in TEAM.md and README.md. Record actual submission receipts.

## Cleanup audit

- Removed local `defer/merge-main-into-rami` after confirming `accae4c` is an ancestor of main.
- `.kanoki-main` contains staged changes. `.kanoki-release` contains untracked image artifacts. Neither may be discarded merely because a redesign was merged.
- `backup/main-wip-2`, `work/rami`, `wip/mcp-inflight` and `work/kanoki` retain commits not patch-equivalent to main. Some changes were integrated with later edits; full redundancy is not proven. Preserve these refs until content review resolves the remaining differences.
- The MCP owner already removed the previous MCP worktree and local pnpm cache, as recorded in STATUS.md. Do not repeat obsolete cleanup instructions.
- Remove worktrees with `git worktree remove` only after unique work is preserved and no agent uses them. No forced removal is needed for release.

## Boundaries

Historical `root-agent.agentcapitalusdc.eth` (old controller, root 4) is permanently revoked according to the last recorded chain read. Its local profile was separately deleted by its owner. It is not the next demo target. Numeric root IDs never identify a controller by themselves.

Keep keys, credentials, private profiles and transcripts outside Git. Capital-mode child creation does not launch an autonomous worker. Show every MCP dashboard image using its exact returned Markdown link, or its supplied Mermaid fallback if the host cannot render it.
