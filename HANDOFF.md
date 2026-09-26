# HANDOFF — Aufräum-/Konsolidierungsauftrag

**Datum:** 2026-09-26 · **Für:** den nächsten Agenten, der den Git-/Deploy-Zustand glättet.

> ⚠️ Dieses Repo wird von **mehreren Agenten gleichzeitig im SELBEN Working Tree** bearbeitet.
> Der Stand **driftet ständig** — alle SHAs unten sind Momentaufnahmen. Vor jedem Schritt
> `git fetch` + `git worktree list` + `git status` frisch prüfen.

## Status (gut)
- **Production ist LIVE** auf dem korrekten main-Stand: **https://agent-capital-tree-silk.vercel.app**
  (deployt aus `origin/main`; zuletzt `cc19c27` „Merge Kanoki design…", raglibol-Vercel).
- `main` == `origin/main` (das Kanoki-Redesign ist in main gemergt).
- **Nichts ist verloren** — alle WIP ist auf Branches gesichert (siehe unten).

## Was aufzuräumen ist

### 1) Verstreute WIP-Branches — prüfen ob in `main`, sonst integrieren, dann löschen
- `origin/backup/main-wip-2` (`e29ff96`) — Snapshot des gestagten **Kanoki/Script**-Stands vor dem main-Alignment. Kanoki ist inzwischen in main → vermutlich **redundant**; verifizieren, dann löschen.
- `origin/work/rami` (`e24702c`) — ältere rami-WIP (**MCP/runtime/plugin** + neue Quelldateien). Prüfen, ob vollständig in main; fehlende Teile integrieren.
- `origin/wip/mcp-inflight` (`1fc3a00`) — erster MCP-WIP-Checkpoint (überlappt mit `work/rami`).
- `defer/merge-main-into-rami` (nur lokal, `accae4c`) — alter manueller Merge, **überholt** (der echte Merge ist erledigt). Löschbar.
- **Bekannte Konfliktdateien** beim Integrieren: `apps/web/src/components/wallet-controls.tsx`, `packages/runtime/capital-entry.mjs`, `packages/plugin/tool-visual.mjs`, `packages/plugin/visual-server.mjs`.

### 2) Lokale Worktrees & Junk
- Aktive Worktrees (`git worktree list`): `.kanoki-main` [work/kanoki-main], `.kanoki-release` [work/kanoki], `.kanoki-mcp-name` [fix/kanoki-mcp-name]. Wenn fertig: **`git worktree remove <dir>`** (nicht `rm` — sonst tote Refs).
- `.pnpm-store/` = Junk (löschen). Bereits entfernt: der verschachtelte Klon `agent-capital-tree/` und der Worktree `.main-onboarding`.
- Diese Ordner sind lokal via **`.git/info/exclude`** aus `git status` ausgeblendet (nicht committet). Beim echten Aufräumen ggf. dort wieder entfernen.
- **Windows-Falle:** tief verschachtelte `node_modules` → `rm -rf`/robocopy scheitern mit „Filename too long". Für Worktrees `git worktree remove`; für Streuordner robocopy-Mirror-auf-leer-Trick.

### 3) git-Fenster nie dauerhaft sauber
Solange mehrere Agenten im selben Verzeichnis schreiben, tauchen laufend geänderte Dateien auf (aktuell u. a. `dashboard.tsx`, `x402-panel.tsx`, `agent-activity.tsx`, `scripts/*`). **Diese Änderungen NICHT blind verwerfen** — es ist laufende Arbeit anderer Agenten.

### 4) MCP ist noch WIP
Wird noch angepasst — vor einem Merge mit dem MCP-Owner koordinieren.

## Deploy (Ramis eigenes Vercel — `raglibol`)
- Projekt `agent-capital-tree`, rootDirectory `apps/web`, Team `raglibol`. Prod-Alias: `agent-capital-tree-silk.vercel.app`.
- **Keine** Git-Integration → `git push` deployt **nicht**. Deploy aus Repo-Root (besser: aus isoliertem `git archive`-Snapshot, um den churn zu umgehen):
  ```
  vercel deploy --prod --yes --scope raglibol
  ```
- Build braucht **`allowBuilds`** in `pnpm-workspace.yaml` (`esbuild`, `@tailwindcss/oxide`, `lightningcss`, `sharp`) und `sdk`+`multibaas` **vor** `next build` (`apps/web/vercel.json`). Details: **`RAMI-AGENTS.md`**.

## Goldene Regel (Ursache des Chaos)
**Nicht** mehrere Agenten im **selben** Working Tree auf demselben Branch laufen lassen — ein Agent pro Worktree/Branch. Merges/riskante Git-Ops **nur aus isoliertem Snapshot** (`git archive <sha>` / separater Worktree), nie im geteilten Tree.
