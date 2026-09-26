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
- **MCP-Integration (`/mcp`):** eigener Dashboard-Bereich (Sidebar „MCP"), der den agentenseitigen MCP-Server dokumentiert — Server-Identität `capital-tree`, Dashboard-/Runtime-Status ohne Behauptung einer lokalen MCP-Verbindung, vollständiger Tool-Katalog und ein in PowerShell/Bash gleicher Read-only-Prüfpfad mit Copy-Button. Finanzaktionen verweisen separat auf Linux/WSL2. Bausteine: `apps/web/src/components/mcp-panel.tsx`, `copy-block.tsx` (wiederverwendbarer Copy-Codeblock), `lib/mcp-tools.ts`; verdrahtet in `dashboard.tsx` (`views`-Array + View-Block), `lib/dashboard-page.tsx` (`DashboardView`) und `app/[section]/page.tsx` (Route-Allowlist). **`mcp-tools.ts` ist nur ein Anzeige-Spiegel von `packages/plugin/src/tools.ts` — bei Tool-Änderungen synchron halten** (aktuell **16 Tools**: 5 read / 11 write, inkl. der x402-Tools `getPaymentServices`/`purchaseService`; per Live-stdio-Handshake verifiziert).

## Deploy (Ramis eigenes Vercel)
- Ziel: **Ramis** Vercel-Team **`raglibol`**, Projekt `agent-capital-tree`, Root Directory `apps/web`. (Der Haupt-/andere Tree nutzt ein **anderes** Vercel-Konto — nicht verwechseln.)
- Deploy per CLI aus dem **Repo-Root**: `vercel deploy --prod --yes --scope raglibol` (baut auf Vercel-Infra, aliased auf die Production-URL).
- **Keine** Git-Integration → `git push` löst **kein** Deploy aus. Bei laufendem Parallel-Agenten aus einem isolierten `git archive`-Snapshot deployen.
- **Warum keine Git-Integration:** Repo gehört **`CodeByNikolas`**; das GitHub-Konto `raglibol-re` hat nur Push-Rechte (kein Admin). Native Auto-Deploys müsste der Owner per Vercel-GitHub-App in-browser freischalten (`vercel git connect` scheitert sonst); ein GitHub-Actions-Token bräuchte Repo-Admin für das Secret. Beides nicht allein machbar.
- **Lokaler `git ship`-Alias** (nur in diesem Clone, in `.git/config`, **nicht** committet): `!git push origin HEAD && vercel deploy --prod --yes` → pusht + deployt in einem Schritt. Ein reines `git push` deployt nicht. Production-URL: **https://agent-capital-tree-silk.vercel.app**.

## Aktiver Plan: plattformneutraler lokaler MCP

### Hackathon-Schnitt (26.09., vorrangig vor L0–L8)

- `pnpm mcp:doctor` prüft Node, pnpm, Host-Codex und Plattform ohne Secrets. `pnpm mcp:verify` installiert in ein temporäres Codex-Profil und beweist alle 16 Tools plus aktuellen USDC-`getTree` über eine strikt read-only Bridge; kein Wallet, Docker oder Team-Rechner erforderlich. Vorher SDK und Plugin bauen. Genaues Verfahren: `docs/local-setup.md`.
- Native Windows-Finanz-Runtime ist **nicht** unterstützt; `packages/runtime/cli.mjs` verweist früh auf WSL2. Der alte `/absolute/private-config.json`-Beispielpfad war ein Platzhalter, keine vorhandene Datei. `/mcp` trennt nun Verify von Agent Actions.
- Host-Codex 0.157.0 ist für den Read-Proof geprüft, Worker-Codex bleibt 0.154.0. Nicht behaupten, dass der lokale Read-Proof das permanente Plugin im persönlichen Codex-Profil installiert oder Writes beweist.
- L0–L8 unten ist die aufgeschobene plattformneutrale Vollarchitektur. Keine Container-/Gateway-Umbauten als stillschweigende Nebenarbeit. Neue kleine Sepolia-Root-/x402-Pitch-Transaktionen erst nach ausdrücklicher Wallet-/Budget-/Konfigurationsprüfung; vorhandene Root-1-/Payment-Runner niemals wiederholen.
- Verbindliche Chat-UX: Jeder MCP-Toolaufruf liefert Dashboard-PNGs, echte lokale Markdown-Bildlinks und Mermaid-Fallback; auch Setup, Aktionen und Fehler. Grünpalette und Manrope/DM Mono entsprechen dem Dashboard. Die PNG-Erzeugung ist im Plugin mit WASM/Fonts paketiert. Host-Darstellung separat prüfen; Bildausgabe nicht durch bloßen Text ersetzen.
- Öffentliche Guide-URL auf Ramis Vercel: `https://agent-capital-tree-silk.vercel.app/mcp`, ohne Vault nutzbar. Aktueller verifizierter Deploy `dpl_2YAGsD77UKgUocrZeqhKsMq6J5tT` enthält Codex-Desktop-Chat-Anleitung und ehrlichen Connection-Flow. Die Haupt-URL gehört zu einem anderen Vercel-Projekt und wird durch diesen Deploy nicht aktualisiert.
- Neue Chat-Einrichtung: `scripts/mcp-readonly-server.mjs` ist ein separater schlüsselloser STDIO-MCP mit `getTree`, `visualizeTree` und `prepareRootSetup`. Letzteres öffnet standardmäßig den normalen Systembrowser mit bestehendem Wallet-Profil, keine isolierte Chat-Browser-Session. `openBrowser:false` bereitet nur den Link vor; Wallet-Verbindung und Signaturen bleiben Nutzeraktionen. `pnpm mcp:chat-verify` prüft alle drei Tools ohne Signatur. `codex mcp add capital_tree_readonly -- <node-exe> <absolute-script-path>` schreibt eine **persönliche** Registrierung; der temporäre `mcp:verify`-Lauf tut das nicht. ChatGPT-Desktop und Codex teilen die lokale Konfiguration; ChatGPT-Web liest sie nicht. Bereits vorhandenen Checkout nutzen, keinen zweiten Clone erzeugen. Keine globale Nutzerkonfiguration ohne Auftrag ändern.

### Festgelegtes Produktziel

- **Local-first bleibt verbindlich:** kein öffentlicher Remote-MCP, kein Cloud-Signer, keine gehostete Finanz-Runtime. Ein Judge installiert Plugin und Companion auf seinem eigenen Laptop. Unsere Rechner dürfen ausgeschaltet sein.
- **Nicht verwechseln:** Das Plugin/`bundle/server.mjs` ist nur die stdio-MCP-Grenze. Für echte Tools braucht es den authentifizierten Companion, RPC, Operator-Key und für Modell-Worker Docker plus eigenen CLIProxyAPI-Zugang.
- **Portabilität durch Linux im Container:** Windows, macOS und Linux verwenden denselben gepinnten Companion-Container. Keine Abschaltung der heutigen UID-/Rechte-/Isolationsprüfungen, nur Verlagerung in eine kontrollierte Linux-Laufzeit.
- **Keine alten Finanzläufe wiederholen:** Root 1/Child 2 und vorhandene USDC-/LP-/x402-Nachweise bleiben unberührt. Öffentliche Abnahme erst mit einem ausdrücklich neuen, klein finanzierten Testroot.

### Zieloberfläche

Der Host soll nur diese plattformgleichen Befehle benötigen; Namen dürfen sich bei der Implementierung noch ändern, die Verantwortungsgrenze nicht:

```text
act-mcp doctor
act-mcp setup
act-mcp prepare-root
act-mcp start
act-mcp status
act-mcp stdio
act-mcp stop
```

`mcp.json` startet ausschließlich `node <PLUGIN_ROOT>/scripts/mcp-launcher.mjs stdio`. Der Launcher findet das richtige lokale Profil und führt den MCP innerhalb des laufenden Companion-Containers mit `docker exec -i` aus. stdin/stdout bleiben reines MCP; Diagnose geht ausschließlich auf stderr. Root-Token, Runtime-Origin und Provider-Key werden nicht auf den Host exportiert.

### Zielarchitektur und Sicherheitsinvarianten

1. **Companion-Container:** gepinntes Linux-Image, read-only Root-FS, privates profilgebundenes Named Volume für Domainbindung, Keystore, Identitäten, Journale und Konfiguration. Nur dieser vertrauenswürdige Container erhält den Docker-Socket; diese Host-Macht ist ausdrücklich dieselbe Vertrauensrolle wie der heutige native Companion.
2. **Worker-Netz:** pro Companion-Domain ein Docker-Netz mit `--internal`. Worker hängen ausschließlich dort; der Companion zusätzlich an seinem notwendigen RPC-/CLIProxyAPI-Netz. Kein veröffentlichter Worker-Port.
3. **Gateway-Berechtigung:** zufälliges kurzlebiges Secret, nur gehasht im Companion gespeichert und an Worker-ID, Root-ID, Node-ID, Autoritätsgeneration, Modell, Ablauf und Call-Budget gebunden. Erlaubt ausschließlich bekannte `POST /v1/responses` und `POST /v1/tools/<tool>`-Pfade mit Größenlimits. Es ist weder MCP-Bearer noch Provider-Credential noch Signierschlüssel.
4. **Worker-Speicher:** getrennte Named Volumes für Workspace und eigenen Schlüssel; niemals das Companion-Volume oder ein Sibling-Volume mounten. Worker erhalten keinen Docker-Socket. Volumes werden erst nach eindeutigem Prozessende beziehungsweise dokumentierter Recovery entfernt.
5. **Secrets:** Setup liest Credentials aus einer ausdrücklich gewählten lokalen Datei oder verdeckter Eingabe und schreibt sie über stdin direkt in das private Volume. Keine Secrets in argv, Env-Ausgaben, Logs, Git, Vercel oder MCP-Ergebnissen. Windows-ACLs sind nicht die Schutzannahme; das Linux-Volume erzwingt `0600/0700`.
6. **Idempotenz:** vorhandene Spawn-/Payment-Journale und Onchain-Operationsschlüssel bleiben maßgeblich. Container-/Host-Neustart, abgebrochener stdio-Client oder verlorene Verbindung dürfen weder Write noch Modelltask erneut ausführen.
7. **Architektur:** getrennte gepinnte AMD64-/ARM64-Artefakte oder ein nachweislich reproduzierbares Multi-Arch-Image. Host-Codex und Worker-Codex getrennt versionieren; den Worker-Pin `0.154.0` erst nach eigener Abnahme ändern.

### Arbeitspakete, Dateiverantwortung und Abnahme

Bei paralleler Arbeit vor jedem Paket Dateibesitz im Chat/Status festlegen; niemals gleichzeitig dieselben Dateien ändern.

| Paket | Primäre Dateien | Abnahme vor Commit |
| --- | --- | --- |
| L0 Schnittstelle | neue Typen unter `packages/runtime/src`, relevante Tests | Transport-/Profil-IDs strikt validiert; keine Verhaltensänderung bestehender Linux-Pfade |
| L1 Netzwerk-Gateway | `gateway.ts`, `bridge.mjs`, neue Gateway-Tests | fremder/abgelaufener Token, falscher Pfad, Origin, Oversize und Sibling-Zugriff scheitern; gültiger MCP-/Inference-Aufruf gelingt |
| L2 Worker-Container | `container.ts`, `launcher.ts`, Docker-Testfixtures | nur internes Netz, eigene Volumes, kein Companion-Volume, kein Docker-Socket, gepinntes Image und Ressourcenlimits |
| L3 Companion-Image | neue Runtime-Dockerfiles/Buildskripte, `companion.ts` | Start/Stop/Restart auf Linux; privates Volume; Reconciliation ohne Doppelaktion; kein Secret in `docker inspect` |
| L4 Host-Launcher | `packages/plugin/scripts/mcp-launcher.mjs`, CLI-/Unit-Tests | identisches Verhalten in PowerShell/Bash; stdout bleibt protokollrein; fehlendes Docker/Profil erklärt sich sicher |
| L5 Setup/Doctor | neue portable CLI-/Setup-Dateien | idempotentes Profil; falsche Dateien/Images/Architektur fail-closed; keine Ausgabe von Credentials |
| L6 Plugin-Paket | `plugin.json`, `.codex-plugin/plugin.json`, `mcp.json`, `.mcp.json`, Plugin-Tests | Manifest-Validator grün; Installation in frischem Codex-Profil; genau ein registrierter MCP; aktueller Host `0.157.0` separat dokumentiert |
| L7 Web/Doku | `/mcp`, `docs/local-setup.md`, READMEs | keine Platzhalter als kopierbarer Endbefehl; klare Voraussetzungen; 16 Tools synchron; Desktop/Mobil-Browser-Smoke |
| L8 Plattform-E2E | neue Berichte unter `artifacts/`/`deployments/` ohne Secrets | Windows 11 + Docker Desktop, macOS ARM64, Linux AMD64: Install, Handshake, Tool-Liste, Live-Read; mindestens ein neuer kleiner Sepolia-Write- und Recovery-Lauf |

### Testreihenfolge je Paket

1. Engste Unit-/Negativtests.
2. Paket-Typecheck und Paket-Test.
3. Runtime/Plugin-Integration ohne Chain-Write.
4. Erst bei relevanten Grenzänderungen kompletter Workspace-Test.
5. Öffentliche Sepolia-Aktion ausschließlich nach grüner lokaler/Fork-Abnahme und mit neuem Operationsschlüssel/Testroot.
6. Vor Commit Diff und Ausgaben auf Secrets sowie unbeabsichtigte Paralleländerungen prüfen.

Windows-Fehlschläge der heutigen Unix-Tests nicht als Produktfix durch gelockerte Rechteprüfungen kaschieren. Der neue Pfad muss die Prüfungen innerhalb Linux bestehen; native Hosttests prüfen nur Launcher/Docker-Orchestrierung.

### Commit-, Push- und Deploy-Rhythmus

- **Ein kohärentes Arbeitspaket = ein Commit** als CodeByNikolas, unmittelbar nach seinen grünen Abnahmetests. Beispielbetreffe: `refactor(runtime): add scoped network gateway`, `feat(plugin): launch local companion through Docker`.
- Vor jedem Commit `git status`, gezielter Diff und `git commit --only -m "..." -- <eigene pfade>`. Fremde untracked/geänderte Dateien bleiben unangetastet.
- Nach jedem Commit zuerst prüfen, ob `origin/work/rami` fortgeschritten ist. Bei Divergenz Integration nur im separaten Worktree/Snapshot; danach Fast-Forward und `git push origin work/rami`.
- **Deploy nach jedem webwirksamen grünen Commit**, nicht nach reinen Runtime-/Test-/internen Dokumentationscommits ohne Änderung des Vercel-Artefakts. Wegen Parallel-Agenten immer einen isolierten `git archive`-Snapshot des exakt gepushten Commits deployen. Danach Production-URL und betroffene Route lesen/smoken; ein Vercel-Build allein ist keine Abnahme.
- `STATUS.md` nach jedem Paket mit Commit, Tests, Deployment-ID/URL (falls relevant), offenen Plattformnachweisen und Freigaben aktualisieren. Keine Sammel-Fertigmeldung, bevor L8 erfüllt ist.

### Harte Abschlusskriterien

- Frisches Codex-Profil findet genau den einen lokalen `capital-tree`-MCP ohne manuelle `config.toml`- oder Env-Secret-Einträge.
- `doctor/setup/start/stdio/stop` funktionieren mit derselben Benutzeroberfläche auf Windows, macOS und Linux.
- Handshake und alle 16 Tools sind sichtbar; unkonfigurierbare optionale Integrationen melden explizit unavailable statt Fake-Erfolg.
- Ein aktueller `getTree`-Read funktioniert auf allen drei Plattformen.
- Ein neuer kleiner Sepolia-Root besteht Spawn, echten isolierten Worker, kontrollierte Aktion, Widerruf und Rückholung; kein alter Seed wird verändert.
- Worker-Netzwerk-, Volume-, Key-, Sibling-, Restart-, Timeout-, Reorg-/Uncertain-Write- und x402-Replay-Negativtests sind grün.
- Unabhängiger Laptop benötigt keine Datei, keinen Token und keinen laufenden Prozess von Rami oder einem Teammitglied; eigene RPC-/CLIProxyAPI-/Wallet-Voraussetzungen bleiben ehrlich dokumentiert.
