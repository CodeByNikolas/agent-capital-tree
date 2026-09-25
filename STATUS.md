# Agent Capital Tree — Status

Stand: 25. September 2026.

## Aktueller Stand

- Produkt und Architektur in PLAN.md festgehalten; konkrete Curvegrid-Integration eingearbeitet.
- Architekturprüfung durchgeführt; Eigentümer-Notausstieg bei ungültigem ENS und Indexer-Unabhängigkeit ausdrücklich festgelegt.
- Bisher ausschließlich Planungsdokumente. Kein Anwendungscode, keine Wallet, kein Deployment und keine neue öffentliche Repository-Veröffentlichung.
- P0 teilweise: Plan/Status/Arbeitsregeln vorhanden. Workspace und CI fehlen. P1–P13 offen.

## Nächster Umsetzungsschritt

P0 abschließen und P1 prüfen: ENS-Namespace/ABI, lokaler v4-Lebenszyklus, Plugin-/Worker-Isolation, Browser-Wallet und MultiBaas-Zugang. Ergebnisse mit tatsächlich ausgeführten Befehlen/Tests und verbleibenden Hindernissen hier festhalten.

## Offene externe Voraussetzungen

- Neue Testkonten erzeugen; anschließend Funding-Adresse und geschätzten Sepolia-ETH-Bedarf mitteilen.
- MultiBaas-Sepolia-Instanz und Berechtigungen einrichten; Zugang noch nicht vorhanden/verifiziert.
- Tatsächlichen ENSv2-Namespace und kompatible Deployment-Version validieren.
- CLIProxyAPI-Modelle und begrenzten Worker-Zugang in der neuen Runtime testen.
- Unabhängiger Jury-Betrieb verlangt zusätzlich eigenen CLIProxyAPI-Modellzugang; frisches Codex-Login allein reicht nicht. Setup und echter Worker-Aufruf sind P1-/P11-Abnahmekriterien.

## Arbeitsprotokoll

- 2026-09-25: Bestehende ENS-/Uniswap-Quellanalysen erneut gelesen; Curvegrid-Docs/SDK und offizielles Sepolia-Beispiel gegenprüft. Vollständigen Plan mit Akzeptanztests persistiert. Keine ausführbaren Anwendungstests vorhanden; Dokumentprüfung ist kein E2E-Nachweis.
- 2026-09-25: Sol-Architekturreview eingearbeitet: ENS-unabhängiger Owner-Notausstieg, zentrale vertrauenswürdige Event-Quelle für MultiBaas, isolierter Inferenzzugang und explizite Jury-Modellvoraussetzung.
