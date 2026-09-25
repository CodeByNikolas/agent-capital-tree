# Agent Capital Tree — Status

Stand: 25. September 2026.

## Aktueller Stand

- Produkt und Architektur in PLAN.md festgehalten; konkrete Curvegrid-Integration eingearbeitet.
- Architekturprüfung durchgeführt; Eigentümer-Notausstieg bei ungültigem ENS und Indexer-Unabhängigkeit ausdrücklich festgelegt.
- Öffentliches Repository: https://github.com/CodeByNikolas/agent-capital-tree. Kleine Änderungen werden separat committet und regelmäßig gepusht.
- P0 vorhanden: pnpm-Workspace, gepinnte Dependencies, TypeScript-/Foundry-CI. GitHub-Checks für den integrierten Stand bestanden.
- P1/P2 teilweise: ENS-Deployments mit Source-Artefakten verglichen; ManagedRegistry implementiert, vier Foundry-Tests bestanden. Parent-Verbindung ist unveränderlich; Transfers und Operator-Approvals gesperrt.
- ENSv2-Sepolia-Name agentcapitaltree.eth ist registriert und Owner/Ressource/Expiry geprüft. Öffentliche Receipts stehen in deployments/sepolia.json; Controller-/Projektregistry-Anbindung folgt.
- Deployment-Wallet 0x280Ca099242D7164cD001E4479D59f13CD0ea7c9 und getrennte Test-Wallet 0x0B59E040F864AFd07Ed448F58199a296413333bf erstellt. Verschlüsselte Schlüssel liegen außerhalb des Repos. Sepolia-Funding ist eingetroffen.
- Echtes MetaMask 13.49.0 in lokalem Chromium installiert; Test-Wallet importiert, optionale Telemetrie deaktiviert und erneutes Öffnen/Entsperren geprüft. Dapp-Verbindung und Signatur-/Transaktions-E2E stehen noch aus.
- P5 Preview-Dashboard implementiert; Next-Produktionsbuild bestanden. Neues Vercel-Projekt erstellt; Monorepo-Konfiguration korrigiert, Veröffentlichung läuft. Keine Finanzfunktion als live behaupten.
- P6 Runtime-Grundlage implementiert: sieben Tests zu authentifizierten Worker-Kontexten, Mount-/Netzwerk-Konfiguration, Spawn-Reconciliation und eingeschränktem Inferenzbroker bestanden. Disposable-Container-Test mit synthetischen Daten bestanden. Zwei echte Modell-Worker noch offen.
- P7 Plugin-Grundlage implementiert: vier Tests, MCP-Handshake und Installation in frischem Codex-Profil bestanden. Echte Companion-/Chain-Anbindung noch offen.
- P3 Controller und P10 MultiBaas-Adapter werden parallel entwickelt. P8/P9 Uniswap sowie P11/P12 vollständiges Onboarding/E2E offen.

## Nächster Umsetzungsschritt

Controller-Tests und Schnittstellen integrieren; SDK/Companion und Uniswap anbinden. Vercel-Preview veröffentlichen und mit echter MetaMask-Wallet verbinden. Danach Controller/Registry auf Sepolia deployen und MultiBaas live konfigurieren. PLAN.md-Abnahmebedingungen bleiben unverändert.

## Offene externe Voraussetzungen

- MultiBaas-Instanz https://d7zveyyfkvdbxdbd7n3rk6o3ee.multibaas.com vom Nutzer erhalten und per HTTP erreichbar. Eingeschränkter API-Key noch ausstehend: Nutzer führt scripts/configure-multibaas.sh in eigenem Terminal aus. Administrative Contract-Registrierung noch erforderlich.
- Projektregistry unter dem bereits erworbenen ENSv2-Namespace anbinden und onchain testen.
- CLIProxyAPI-Modelle und begrenzten Worker-Zugang in der neuen Runtime testen.
- Unabhängiger Jury-Betrieb verlangt zusätzlich eigenen CLIProxyAPI-Modellzugang; frisches Codex-Login allein reicht nicht. Setup und echter Worker-Aufruf sind P1-/P11-Abnahmekriterien.

## Arbeitsprotokoll

- 2026-09-25: Bestehende ENS-/Uniswap-Quellanalysen erneut gelesen; Curvegrid-Docs/SDK und offizielles Sepolia-Beispiel gegenprüft. Vollständigen Plan mit Akzeptanztests persistiert. Keine ausführbaren Anwendungstests vorhanden; Dokumentprüfung ist kein E2E-Nachweis.
- 2026-09-25: Sol-Architekturreview eingearbeitet: ENS-unabhängiger Owner-Notausstieg, zentrale vertrauenswürdige Event-Quelle für MultiBaas, isolierter Inferenzzugang und explizite Jury-Modellvoraussetzung.
- 2026-09-25: Umsetzung gestartet. Benutzeranweisung zu Prompt-Injection-Abwehr in AGENTS.md und allen Worker-Aufträgen festgehalten. Keine erkannte Übernahme externer Anweisungen. Foundry v1.8.3 ARM64 mit verifiziertem Release-Digest lokal installiert; solc 0.8.26 läuft als gepinnter solc-js-Wrapper. Normale Host-Dienste unverändert.
