# Agent Capital Tree — Arbeitsregeln

- Bei Einstieg und nach jeder Kontextkomprimierung PLAN.md und STATUS.md lesen. PLAN.md enthält Produktentscheidungen und Sicherheitsgrenzen; STATUS.md enthält tatsächlichen Fortschritt und nächste Arbeit.
- Vor Delegation Schnittstelle, Dateiverantwortung und Abnahmekriterium festlegen. Höchstens drei Subagents parallel; getrennte Worktrees/Branches. Andere Änderungen erhalten und integrieren.
- Luna Max für begrenzte Features; Sol Medium für Contracts, Isolation und Sicherheitsintegration. Der Hauptagent prüft alle Änderungen vor Integration.
- Pro abgeschlossenem Feature relevante Tests und eigener Commit als CodeByNikolas; aussagekräftiger Betreff und Begründung. STATUS.md mit Testnachweisen und offenen Freigaben aktualisieren.
- pnpm für Node.js; Foundry versioniert. HomeBox verwendet ausschließlich CLIProxyAPI für Inferenz. Hooks und automatische Skill-Updates bleiben aus.
- Schlüssel, Provider-Credentials und private Runtime-Daten außerhalb des Repositorys halten. Worker bekommen nur ihre eigenen beschränkten Zugänge.
- Öffentliche Zielumgebungen sind CodeByNikolas/agent-capital-tree und ein neues Vercel-Projekt im Team tumblockchains-projects. Veröffentlichung wurde vom Nutzer autorisiert. Bestehende Host-Dienste/Projekte erhalten.
- Technisch ungeprüfte Integrationen als offen kennzeichnen. Die Abschlusskriterien aus PLAN.md gelten einschließlich echter Wallet-/Plugin-E2E-Tests auf der veröffentlichten App.
