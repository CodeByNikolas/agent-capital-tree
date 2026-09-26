# RAMI-AGENTS.md — Arbeitsanweisungen für Ramis Agenten

> **Nur für Ramis Agenten** (Claude Code, Codex, o. Ä.). Rami referenziert diese Datei
> zu Beginn jeder Session ("lies RAMI-AGENTS.md"). Sie **ersetzt nicht** die geteilte
> `AGENTS.md` des Projekts, sondern **ergänzt** sie. Der Agent einer anderen Person soll
> diese Datei **nicht** laden — sie ist absichtlich separat benannt, um Verwechslungen
> zu vermeiden.

## Zuerst lesen
- Geteilte Projektregeln: **`AGENTS.md`** (Trust-Boundary, Commit-Regeln, Delegation) — gilt weiterhin.
- Produktentscheidungen & Sicherheitsgrenzen: **`PLAN.md`**. Aktueller Fortschritt & nächste Arbeit: **`STATUS.md`**.

## Geteilter Working Tree (WICHTIG)
- An diesem Repo arbeitet **parallel ein anderer Agent** auf demselben Branch `work/rami`; er committet und pusht laufend.
- **Nie gleichzeitig an denselben Dateien arbeiten.** Vor jeder Änderung `git status` prüfen und **fremde uncommittete Änderungen nicht überschreiben**.
- Vor dem Commit **gezielt nur eigene Dateien** stagen/committen: `git commit --only -- <pfade>` (mit `-m "…"` **vor** `--`). Keine Sammelcommits, die fremde gestagte Änderungen mitnehmen.

## Merges & riskante Git-Operationen
- Merges (z. B. `origin/main` → `work/rami`) und riskante Git-Ops **nur aus einem isolierten Snapshot**: `git archive <sha> | tar -x -C <tmp>` **außerhalb** des geteilten Verzeichnisses, oder ein separates `git worktree`. **Nie** im geteilten Working Tree mergen (Race/Datenverlust).
- Zuerst Konflikte auflösen, **lokal grün bauen**, dann landen.
- Landen nur als Fast-Forward (`git merge --ff-only`). Remote nur mit `git push --force-with-lease` überschreiben. Verworfene/aufgeschobene Merges als lokalen Branch bewahren.
- **Aktueller Stand:** Der `origin/main`-Merge ist **aufgeschoben**; die fertige, grün gebaute Auflösung liegt lokal als Branch **`defer/merge-main-into-rami`**. Beim Wiederaufgreifen frisch gegen den dann-aktuellen Stand mergen, die Auflösung dort als Vorlage nutzen.

## Build (pnpm-Monorepo)
- pnpm 11 gated Dependency-Build-Scripts über **`allowBuilds`** in `pnpm-workspace.yaml` (NICHT `onlyBuiltDependencies` — diese Version ignoriert es). `esbuild`, `@tailwindcss/oxide`, `lightningcss`, `sharp` auf `false` setzen (vorgefertigte Binaries; sonst bricht der Build mit `ERR_PNPM_IGNORED_BUILDS` ab).
- Die Workspace-Pakete **`sdk`** und **`multibaas`** exportieren aus `dist/` und müssen **vor** `next build` per `tsc` gebaut werden (`next.config` hat kein `transpilePackages`). Der Build-Command dafür steht in `apps/web/vercel.json`.
- **`pnpm --filter …` immer aus dem Repo-Root ausführen, nie aus dem Windows-Home** (`C:\Users\ramie_ckvh54z`). Dort lag versehentlich ein Streu-Node-Projekt (`package.json` + Lockfiles + `node_modules`), wodurch pnpm in fremde Projekte lief (z. B. ein `Hedera`-`package.json` mit illegalem `//`-Kommentar) und der Build fehlschlug. Bereinigt (2026-09-26): `package.json` → `package.json.home-backup` (wiederherstellbar), Lockfiles + `node_modules` gelöscht.

## Web-Konventionen
- Vaults werden über **`?vault=<ENS-Name|Contract-Adresse>`** adressiert. `?root=` ist **stillgelegt** (führt zu `notFound()`). Neue Links/Features müssen das Vault-Modell nutzen.
- **Root-Verzeichnis (aus der Kette, kein Hardcode):** `GET /api/roots` zählt alle Roots direkt von Sepolia auf (`nextNodeId` → `getNode` → `rootOwner`; Label = ENS-Leaf, owner-/ENS-konsistent). Der Client-Hook **`apps/web/src/lib/use-roots.ts`** (`useDiscoveredRoots`, cached) liefert sie an den **`RootAccessBar`** (in `dashboard.tsx`), der daraus Ein-Klick-Chips rendert (Navigation per `?vault=<adresse>`) und die Roots der verbundenen Wallet als **„Your vault"** markiert. Für neue Root-/Vault-Listen **diese Bausteine wiederverwenden**, keine ID-Listen hardcoden.
- **Onboarding-Erklärung:** `apps/web/src/components/onboarding-hero.tsx` trägt den „How it works"-Narrativ; die geführte Tour steckt in `guided-tour.tsx` + `lib/tour-steps.ts` (URL-getrieben via `?tour=1&step=N`). Fachbegriffe über `<InfoHint term="…">` (`info-hint.tsx` + `lib/glossary.ts`) erklären, nicht über natives `title=`.
- **MCP-Integration (`/mcp`):** eigener Dashboard-Bereich (Sidebar „MCP"), der den agentenseitigen MCP-Server dokumentiert — Server-Identität `capital-tree`, Verbindungsstatus, vollständiger Tool-Katalog und eine Codex-Einrichtungsanleitung (Bash **und** PowerShell, mit Copy-Buttons). Bausteine: `apps/web/src/components/mcp-panel.tsx`, `copy-block.tsx` (wiederverwendbarer Copy-Codeblock), `lib/mcp-tools.ts`; verdrahtet in `dashboard.tsx` (`views`-Array + View-Block), `lib/dashboard-page.tsx` (`DashboardView`) und `app/[section]/page.tsx` (Route-Allowlist). **`mcp-tools.ts` ist nur ein Anzeige-Spiegel von `packages/plugin/src/tools.ts` — bei Tool-Änderungen synchron halten** (aktuell **16 Tools**: 5 read / 11 write, inkl. der x402-Tools `getPaymentServices`/`purchaseService`; per Live-stdio-Handshake verifiziert).

## Deploy (Ramis eigenes Vercel)
- Ziel: **Ramis** Vercel-Team **`raglibol`**, Projekt `agent-capital-tree`, Root Directory `apps/web`. (Der Haupt-/andere Tree nutzt ein **anderes** Vercel-Konto — nicht verwechseln.)
- Deploy per CLI aus dem **Repo-Root**: `vercel deploy --prod --yes --scope raglibol` (baut auf Vercel-Infra, aliased auf die Production-URL).
- **Keine** Git-Integration → `git push` löst **kein** Deploy aus. Bei laufendem Parallel-Agenten aus einem isolierten `git archive`-Snapshot deployen.
- **Warum keine Git-Integration:** Repo gehört **`CodeByNikolas`**; das GitHub-Konto `raglibol-re` hat nur Push-Rechte (kein Admin). Native Auto-Deploys müsste der Owner per Vercel-GitHub-App in-browser freischalten (`vercel git connect` scheitert sonst); ein GitHub-Actions-Token bräuchte Repo-Admin für das Secret. Beides nicht allein machbar.
- **Lokaler `git ship`-Alias** (nur in diesem Clone, in `.git/config`, **nicht** committet): `!git push origin HEAD && vercel deploy --prod --yes` → pusht + deployt in einem Schritt. Ein reines `git push` deployt nicht. Production-URL: **https://agent-capital-tree-silk.vercel.app**.
