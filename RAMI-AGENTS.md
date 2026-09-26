# RAMI-AGENTS.md

Work log of Rami's agent-assisted contributions to this repo. Newest entry first.

---

## 2026-09-26 — MCP dashboard section, plugin verification, deploy + environment fixes

### 1. New `/mcp` dashboard section (MCP setup guide + tool catalog)

Added a dedicated **MCP** section to the web dashboard (`apps/web`) that exposes the project's agent-facing MCP interface — previously the only MCP-related UI was a dead placeholder in the Setup view (*"Codex plugin · Independent setup pending"*).

**What it shows** (`/mcp`, new sidebar item):
- **Server identity + status** — the `capital-tree` server, transport (`stdio · node ./bundle/server.mjs`), endpoint (`POST <ACT_RUNTIME_URL>/v1/tools/<tool>`), auth (`Bearer <ACT_MCP_TOKEN>`), 30 s read / 300 s write timeouts, Codex CLI 0.154.0. Connection status reuses the existing `runtimeLabel` heuristic.
- **Tool catalog** — all tools with Read/Write badges, mirrored from `packages/plugin/src/tools.ts`.
- **Setup guide** — ordered steps (prereqs → build plugin → start companion → set env vars → register with Codex → verify), each with copy buttons. Two registration paths (explicit `config.toml` @ 300 s, marketplace @ 60 s) in collapsible disclosures. Env-var step shows **both Bash and PowerShell**.
- **Security note** — the plugin holds no wallet key / provider credential; token is a local `0600` file, re-issued each start, never printed; a model-supplied `agentId` is rejected.

**Files**
- New: `apps/web/src/lib/mcp-tools.ts` (display mirror of `packages/plugin/src/tools.ts` — **keep in sync**), `apps/web/src/components/copy-block.tsx` (reusable copy-to-clipboard code block), `apps/web/src/components/mcp-panel.tsx` (section body).
- Edited: `apps/web/src/lib/dashboard-page.tsx` (`DashboardView` union), `apps/web/src/app/[section]/page.tsx` (route allowlist), `apps/web/src/components/dashboard.tsx` (`views` nav array + view block + Setup step-4 relink), `apps/web/src/app/globals.css` (`.mcp-*` / `.code-block` styles).

**Design note:** no secrets are surfaced. `ACT_RUNTIME_URL` (loopback) and `ACT_MCP_TOKEN` (local file) do not exist in the web app and stay as placeholders in the guide.

**Commits:** `b93a744` (feature), `4424097` (sync catalog to 16 tools + PowerShell snippets).
**Live:** https://agent-capital-tree-silk.vercel.app/mcp

### 2. Plugin / MCP server verification (it works)

Verified `packages/plugin` end-to-end, from the **project directory**:
- `pnpm --filter @agent-capital-tree/plugin build` → `bundle/server.mjs` (~180 ms).
- `pnpm --filter @agent-capital-tree/plugin test` → **7/7 pass**.
- **Live stdio MCP handshake** (initialize → tools/list → tools/call): server `agent-capital-tree` 0.1.0, **16 tools** (5 read / 11 write). Fail-closed guard confirmed (missing env → "runtime is not configured"); strict schema confirmed (forged `agentId` → `-32602 Input validation error`).

**The 16 tools** (source of truth: `packages/plugin/src/tools.ts`):
- Read (5): `getTree`, `getEffectivePolicy`, `getCapitalActivity`, `getOperationStatus`, `getPaymentServices`
- Write (11): `spawnChild`, `purchaseService`, `allocateCapital`, `tightenPolicy`, `swap`, `openPosition`, `increasePosition`, `collectFees`, `closePosition`, `revokeSubtree`, `reclaimAssets`

> The dashboard catalog had been stale at 14 (the x402 tools `getPaymentServices` / `purchaseService` were added by concurrent work); the live handshake caught it and it was synced in `4424097`.

Fully *running* the companion still needs local setup (Sepolia wallet + gas, Docker, CLIProxyAPI model access, a real private config file) — not covered here.

### 3. Deployment (Vercel)

- Project **agent-capital-tree** on Vercel team **raglibol**; production alias **https://agent-capital-tree-silk.vercel.app**. Logged in as `ramiezze`.
- **There is NO Git auto-deploy.** Pushing `work/rami` triggers nothing — the Vercel project is not connected to the GitHub repo. `vercel git connect` fails because the repo is owned by **`CodeByNikolas`** and the current GitHub account (`raglibol-re`) has **push-only** access (no admin). Enabling native auto-deploy needs the repo owner to authorize the Vercel GitHub App in-browser; a GitHub-Actions token approach needs repo admin to add a secret. Neither is self-serviceable from this account.
- **How to deploy:** `vercel deploy --prod --yes` from the repo root (builds on Vercel infra, goes READY, auto-aliases the production URL).
- **Convenience:** a local-only `git ship` alias was added to this clone's `.git/config` (not committed): `!git push origin HEAD && vercel deploy --prod --yes`. Run `git ship` to push + deploy in one step. A plain `git push` does **not** deploy.
- ⚠️ A concurrent agent also deploys to the same production alias periodically; if its working tree is behind, it can overwrite the alias with an older build.

### 4. Environment cleanup (fixed `pnpm --filter … build` failing from home)

Running `pnpm --filter @agent-capital-tree/plugin build` from the Windows home directory (`C:\Users\ramie_ckvh54z`) failed — it was crawling into an unrelated project (`Hedera_Tokenization_v2/.../nextjs/package.json`, which has an illegal `//` comment in JSON). Root cause: a stray, accidental Node project living in the home root.

Cleaned up (kept a recoverable backup):
- `package.json` → renamed to `package.json.home-backup` (restore: rename back + `pnpm install`).
- Deleted `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, and `node_modules/`.

**Rule going forward:** always run `pnpm --filter …` from inside the monorepo, never from home:
```
cd "C:\Users\ramie_ckvh54z\Documents\Hackathons\ETHGlobal\Agent Capital Tree\agent-capital-tree"
pnpm --filter @agent-capital-tree/plugin build
```
