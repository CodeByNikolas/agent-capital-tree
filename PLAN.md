# Agent Capital Tree — verbindlicher Implementierungsplan

Stand: 26. September 2026. Produktentscheidungen sind festgelegt; Implementierung läuft, der tatsächliche Abnahmestand steht in STATUS.md. Dieser Plan ersetzt frühere Brainstorming-Varianten. Nach Kontextkomprimierung zuerst diesen Plan und STATUS.md lesen.

## Aktuelle Erweiterung: offizielles Sepolia-USDC und x402

Nutzerkorrektur26.09.: Rapid Prototyping ohne Abwärtskompatibilität. Das Frontend wird ausschließlich auf die neue USDC-Version umgestellt; keine Versionsauswahl, keine Legacy-Linkauflösung oder Migration. Bereits vorhandenes Onchain-Kapital wird dadurch nicht verändert.

Nutzerauftrag26.09.: Die bestätigten20 Circle-Test-USDC werden für eine additive USDC-Version genutzt. Bestehende ACT-A/B-Contracts, ENS-Verknüpfungen und Root1 bleiben erhalten. Eine neue Version benötigt einen eigenen ENS-Namespace und neue unveränderliche Factories/Controller. Offizieller Token: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, sechs Dezimalstellen, Chain11155111.

Reihenfolge: (1) Kapitaldelegation/Rückholung mit echtem Circle-Vertrag lokal forken; (2) enges PAY-Recht und EIP-3009/ERC-1271-Verifikation mit aktuellem ENS-Mandat, exakt gebundenem Empfänger/Betrag/Nonce/Zeitfenster; (3) standardkonformer HTTP402-Ablauf mit ausdrücklich Sepolia-fähigem Facilitator; (4) öffentliche additive Deployment-/Indexierungsabnahme; (5) UI, Companion, Anleitung und Vercel aktualisieren. Keine allgemeinen Transaktionen, keine stillschweigende PAY-Erweiterung vorhandener Policies, kein mint-Aufruf auf Circle-USDC. Bestehende Regeln für Aktionslimits gelten weiterhin; tatsächlicher Vault-Bestand begrenzt Gesamtverbrauch. USDC allein ist noch keine x402-Integration.

## 1. Produkt, Umfang und Partner

### Dashboard-Neugestaltung (Nutzerauftrag 26.09.)

Die bisherige überladene Ein-Seiten-Ansicht wird durch fünf echte, direkt adressierbare Seiten ersetzt: Übersicht, Agentenbaum, Aktivität, Anwendungen und Einrichtung. shadcn/ui Sidebar ist verbindlich; Badge, Button, Card, Sheet und Table werden nach Bedarf verwendet. Frontend Design, Impeccable und shadcn-MCP begleiten die Umsetzung. Eine ruhige Oberfläche, lesbare Schrift (16px Fließtext, mindestens14px ergänzende Informationen), großzügige Abstände und systemabhängiger Hell-/Dunkelmodus sind Abnahmekriterien.

Der Baum erhält den gesamten Arbeitsbereich seiner Seite. Knotenauswahl öffnet verständliche Details zu Kapital, ENS-Namen, tatsächlichen Rechten und geerbten Grenzen. Root-/Preview-Kontext bleibt beim Seitenwechsel erhalten. Die Übersicht enthält nur die wichtigsten Zustandsinformationen und nächste Schritte; ausführliche Historie und LP-Verwaltung liegen auf eigenen Seiten. Das Produkt wird als delegiertes Agentenkapital dargestellt. Trading ist eine vorhandene Anwendung; x402-Service-Einkäufe gehören inzwischen zum USDC-Umfang; allgemeine Transaktionen und Währungsumrechnung bleiben Future Work.

Alle Live-APIs, Wallet-Aktionen, Owner-Rückholung, Fehler-/Veraltungsgrenzen und die ehrliche MultiBaas-Abdeckungsanzeige bleiben erhalten. Keine neue Contract-Funktion und keine Wiederholung abgeschlossener Finanzläufe für dieses Redesign. GPT-6 Sol High implementiert in separatem Worktree; der Hauptagent prüft Änderungen, aktualisiert den read-only Browser-Smoke, testet Desktop/Mobil, beide Farbschemata, Tastatur/Details und Routenwechsel. Kohärente Änderungen werden einzeln geprüft und committet, danach gepusht und auf Vercel veröffentlicht.

Agent Capital Tree delegiert echtes Kapital entlang eines Agentenbaums. Jeder Agent erhält einen eigenen Vault und ein begrenztes Mandat. Er kann einen Teil seines verfügbaren Kapitals an Sub-Agenten weitergeben, deren Rechte nur enger werden. Der menschliche Eigentümer behält die letzte Rückholbefugnis. Der Root-Agent ist ein vom Menschen autorisierter Operator; seine höhere Modellintelligenz ist keine Sicherheitsannahme.

Das Produkt begrenzt den finanziellen Schadensradius eines kompromittierten Agenten. Es verwaltet keine Modellrechnung und garantiert weder Handelsgewinne noch den Erhalt des ursprünglichen Dollarwerts.

| Partner | Konkreter Beitrag | Angestrebte normale Kategorie |
| --- | --- | --- |
| ENS | ENSv2 Enhanced Access Control (EAC) als maßgebliche Rollenquelle; echte Subnames und Registry-Verknüpfungen | Best Use of ENSv2; $3.000 / $2.000 / $1.000 |
| Uniswap | Begrenzte v4-Swaps und vollständiger LP-Lebenszyklus mit getrenntem Management und Rückholung | Best Uniswap Stack Contribution; $3.000 / $2.000 / $1.000 |
| Curvegrid | MultiBaas indexiert Kapital- und Aktionshistorie für Dashboard und Master-Agent | Best AI Agent Project ($1.000), ergänzend Best Digital Asset Dashboard ($1.000) |

World ist ausgeschlossen. Wir planen drei Partner, keine vierte Integration. Mehrere Kategorien eines Partners sind keine Zusage für kumulierte Gewinne. MultiBaas ist laut Curvegrid-Ausschreibung optional, seine echte Integration gehört jetzt zu unserem Zielumfang.

### Verbindlicher MVP

- Ethereum Sepolia (Chain-ID 11155111), maximal drei Agentenebenen einschließlich Root und 32 Knoten je Root.
- Öffentliches Factory-System für eigene Nutzer-Roots unter einem verifizierten Projekt-ENS-Namespace. Jeder Nutzer braucht nur seine eigene Wallet, kein individuelles ENS-Kauf-Onboarding.
- Offizielle Circle-Test-USDC und ein eigener, ausdrücklich wertloser sechsstelliger DEMO-USD-Token; keine Rebasing-/Fee-on-transfer-Tokens. Beträge werden ausschließlich in rohen Token-Einheiten abgerechnet.
- Ein erlaubter Uniswap-v4-Pool ohne Custom Hook, feste Gebührenstufe und fester Tick-Bereich; höchstens eine aktive LP-Position je Vault.
- Eigener Codex-Plugin-/MCP-Flow; Aufgaben werden in Codex erteilt. Ein Next.js-Dashboard zeigt Zustand und erlaubt Wallet-Verwaltungsaktionen.
- Isolierte Docker-Worker mit getrennten Schlüsseln und Workspaces. HomeBox ist Demo-Laufzeit, nicht Pflichtinfrastruktur für die Jury.
- Eigenes Kontrollpanel mit Baum, geerbten Rechten, Kapital, Beständen, LP und Historie. Keine zusätzliche Benutzer-/Passwortverwaltung; Wallet-Verbindung genügt für Transaktionen.
- Keine Arbitrary-Call-Engine, Uniswap-Hooks, automatische LP-Optimierung, Cloud-Signer, öffentliche Runtime-Relay-Infrastruktur oder automatische SSH-Provisionierung.

## 2. Architektur und verbindliche Sicherheitsregeln

### ENS-Rollen, Namensbaum und Kapital

Ein unveränderlicher Controller/Factory, Vaults und angepasste ENSv2 Permissioned Registries bilden den Onchain-Kern. Der Controller verwaltet die Baumstruktur; die registrierten ENS-Ressourcen enthalten die tatsächlichen Finance-Rollen. Numerische Regeln gehören in die Vault-/Controller-Logik und nicht in ENS-Textmetadaten.

Jeder Knoten bindet eine stabile interne ID, parentId, rootId, Agentenadresse, Vault-Adresse, Registry, Label, ursprüngliche EAC-Ressourcengeneration und Policy. Registry-Nesting bildet wirkliche ENS-Subnames ab; eine bloße Zeichenkette mit Punkten genügt nicht. Die genaue kompatible ENS-Beta-Version und ihr Deployment werden in P1 fixiert.

- Native ENS-EAC-Rollen kombinieren nur ROOT_RESOURCE und die jeweilige Ressource innerhalb einer Registry. Sie erben nicht automatisch von übergeordneten ENS-Namen. Unsere Contracts prüfen deshalb die begrenzte Vorfahrenkette bei jeder normalen Aktion.
- Finance-Rollen unterscheiden Delegation, Swap, LP-Management, Gebührenabholung, regulären LP-Exit, Einschränkung/Widerruf und Rückholung. EAC-Adminrollen werden vom Controller nur über geprüfte Verwaltungsfunktionen genutzt. Worker erhalten keine frei verwendbaren Registry-Adminrechte.
- Keine regulären Finance-Rollen auf ROOT_RESOURCE. Das Projektteam erhält weder eine Finanz-Admin-Hintertür noch Upgrade-Rechte über Nutzer-Vaults. Registry-Adminrechte eines Controllers sind ausschließlich über nutzerautorisierte Funktionen erreichbar.
- Namensübertragungen und generische ERC1155-Operatorfreigaben sind für den verwalteten Kapitalbaum deaktiviert. Resolver-, Parent-, Subregistry- und Upgrade-Pfade dürfen keine Rechteumgehung ermöglichen.
- Jede normale Aktion prüft aktuellen ENS-Registrierungsstatus, Ressourcenbindung, kanonischen Pfad, tatsächlichen Aufrufer, lokale EAC-Rolle, erlaubte Aktion sowie alle Policies und Widerrufsmarker ihrer Vorfahren. Ressourcenwechsel durch Ablauf/Neuregistrierung sperren bestehende Mandate.
- Policies enthalten erlaubte Fähigkeiten, Tokens/Pool, Höchstbetrag je Aktion/Token und Gültigkeitsende. Effektive Mengenlimits sind das Minimum, Allowlisten die Schnittmenge, Ablauf das früheste Datum. Keine Blacklist parallel zur Allowlist.
- Kapital wird bei Allokation tatsächlich vom Eltern-Vault an den Child-Vault übertragen. Ein Vault kann nur sein freies Guthaben delegieren. Zuweisungen innerhalb des Baums sind keine neuen Einzahlungen und werden in Root-Summen nicht doppelt gezählt.
- Aktionslimits begrenzen einzelne Vorgänge; sie sind ausdrücklich keine kumulierten Verlust- oder Umsatzlimits. Der verfügbare Vault-Bestand und die begrenzte Kapitalzufuhr bestimmen die finanzielle Exposition. Handelsumsatz, Kapitalzuweisung und aktueller Bestand werden separat dargestellt.
- Bestehende Policies können nur eingeschränkt werden. Mehr Kapital wird ausdrücklich durch einen berechtigten Eltern-Agenten zugewiesen; mehr Rechte erfordern einen neuen Knoten. Teilbaum-Widerruf ist im MVP dauerhaft; neue Arbeit erhält neue Knoten und Schlüssel.
- Eltern dürfen nur eigene Nachfahren verwalten. Das Entziehen einer delegierenden Verwaltungsrolle oder das Widerrufen eines Knotens stoppt dessen delegierte Nachfahren über die geprüfte Autoritätskette. Entzug einer einzelnen lokalen Aktionsrolle ist kein impliziter globaler Widerruf; die Oberfläche unterscheidet diese Vorgänge.
- Kein beliebiges calldata/delegatecall, kein frei wählbarer Auszahlungsadressat. Nur typisierte, begrenzte Methoden und fest gebundene Adapter. Reentrancy-Schutz und kontrollierte Token-Freigaben gelten auch für Callback-Pfade.

### Eigentümer, Root-Operator und Notausstieg

Der menschliche Eigentümer ist unveränderlich am Root hinterlegt. Nur er bindet oder ersetzt den Root-Operator und definiert dessen Mandat. Ein Operatorwechsel invalidiert die alte delegierte Autoritätsgeneration einschließlich ihrer Worker; bestehende Assets bleiben rückholbar. Das Projektteam kann die Nutzer-Wallet nicht ersetzen.

Normale Eltern-Rückholung verlangt eine weiterhin gültige Elternberechtigung. Sie stoppt den Zielzweig, schließt dessen LP-Positionen und führt Mittel stufenweise zu den gebundenen Eltern-Vaults zurück. Bei 32 Knoten darf dies mehrere explizite Transaktionen benötigen; Fortschritt ist sichtbar und wiederaufnehmbar.

Der menschliche Eigentümer besitzt zusätzlich einen eng begrenzten, ENS-unabhängigen Notausstieg: dauerhaft sperren, feste bestehende LP-Positionen schließen und Assets an den gebundenen Eltern-Vault beziehungsweise abschließend die Eigentümeradresse zurückholen. Dieser Pfad erlaubt keine neuen Strategien, Swaps, Rechteausweitung oder beliebigen Empfänger. Er bleibt nach ENS-Ablauf, Detachment, Rollenwiderruf, ausgefallener Runtime und ausgefallenem MultiBaas verfügbar.

LP-Management-Widerruf stoppt zukünftige Agentenaktionen, beendet aber weder Preisrisiko noch LP-Exposition. Exit und Rückholung sind eigene Aktionen. Der Eigentümer setzt beim Notausstieg ausdrücklich Mindestoutputs/Deadline; diese dürfen nicht von einem abgelaufenen Agentenmandat blockiert werden. Rückholbar sind verbleibende Assets, nicht ein garantierter ursprünglicher Dollarbetrag.

### Uniswap-Integration

Der Vault behält die PositionManager-NFT und alle Auszahlungen. Worker erhalten keine NFT-Transfer-/Operatorfreigaben. Ein typisierter Swap-Adapter nutzt die verifizierten v4-Verträge; LP-Operationen rufen den PositionManager direkt auf. Kein Zugriff auf beliebige Router-Kommandos.

- MVP-Aktionen: begrenzter Exact-Input-Swap, Position öffnen/vergrößern, Gebühren sammeln, Position schließen und leeres NFT verbrennen.
- Jeder Aufruf bindet Pool, Token, Tick-Bereich, Input-Maxima, Output-Minima, Deadline und Vault-Empfänger. Die Policy begrenzt Input und Pool; Output-Minima sind kein oraclebasierter Verlustschutz.
- Gebührenabholung verwendet den in der fixierten Periphery-Version getesteten Null-Liquiditäts-Increase und darf keine Position verkleinern oder Principal übertragen.
- Ein eigener kontrollierter Test-Swap erzeugt reale Testpool-Gebühren für die Demo. Eine ertragslose Position wird nicht mit erfundenen Gebühren dargestellt.
- Kein Subscriber und kein Custom Hook. Autorisierung gehört an die Vault-Grenze; Router-/Hook-Absender sind nicht automatisch die Agentenidentität.
- Token-/Permit2-Freigaben sind eng auf benötigte Contracts, Beträge und Gültigkeit begrenzt; Restfreigaben werden berücksichtigt und geprüft.

### Curvegrid MultiBaas: verbindliche Integration

MultiBaas ist unsere indexierte Historie, keine Berechtigungsinstanz. Wir registrieren Controller-ABI und Sepolia-Adresse und aktivieren Event-Synchronisierung. Der kostenlose Instanzplan erlaubt nur100 Blöcke Rückblick; nach Nutzerentscheidung vom26.09. gibt es kein bezahltes Upgrade. Tatsächlicher Indexierungsstart ist deshalb Block11783944. Vollständige Historienabnahme erfolgt an einem danach neu erstellten Root. Ältere Roots behalten ihre separaten RPC-/Transaktionsnachweise; ihre fehlende MultiBaas-Historie wird nicht rekonstruiert oder als vollständig ausgegeben. Den Contract müssen wir nicht über MultiBaas deployen; Foundry bleibt unser Contract-Werkzeug.

Der Controller gibt kanonische Events zu Node-Erstellung, Allokation, Rückholung, Policy-/Operatoränderungen, Widerruf und erfolgreichen Swap-/LP-Aktionen aus. Finance-Events enthalten rootId/nodeId, betroffene Tokens und tatsächlich ausgeführte Beträge beziehungsweise tokenId/Liquidität. Externe Event-Meldungen werden ausschließlich von dem beim Controller registrierten Vault akzeptiert; keine frei fälschbare Report-Funktion. Fehlgeschlagene Transaktionen hinterlassen keine Events.

- Ein kleiner serverseitiger MultiBaas-Adapter nutzt das offizielle TypeScript-SDK/REST für gefilterte Event Queries und Aggregationen. Vercel hält einen eingeschränkten Daten-API-Key; administrative Einrichtungsschlüssel bleiben lokal.
- `getCapitalActivity(rootId, cursor)` liefert geordnete, paginierte Onchain-Historie und Datenherkunft. Das Dashboard und ein gleichnamiges MCP-Lesewerkzeug für den Master verwenden diese Darstellung.
- UI-Aktualisierung zunächst alle zehn Sekunden während sichtbarer Nutzung und nach bestätigten Transaktionen. Keine Webhooks, Queue, eigene Indexer-Datenbank oder langfristige serverseitige Prozessschleife im MVP.
- Historie unterscheidet Einzahlungen von außen, interne Allokation, Rückholung, Handelsvolumen und Gebühren. Aktuelle Guthaben/LP-Bestände und effektive Rechte stammen aus aktuellen Contract-Abfragen. Kein PnL aus bloßen Kapitalflüssen und keine manipulierbare Testpool-USD-Bewertung.
- Events werden über chainId/txHash/logIndex dedupliziert, nach Block/Transaktion/Log sortiert und bei erneuter Abfrage ersetzt statt blind angehängt. Indexierungsverzug und Bestätigungsstatus werden sichtbar. Reorg-Tests gleichen gegen kanonische Receipts ab; Chain-Bestätigung ist nicht gleich endgültige Finalität.
- Einzelne Kindadressen müssen nur zusätzlich registriert werden, falls dort benötigte Events nicht zentral gespiegelt werden. Automatische Factory-Discovery wird nicht vorausgesetzt.
- Bei MultiBaas-Ausfall zeigt die Historie einen klaren Fehler/veralteten Stand. Direkt gelesener Zustand und Wallet-Notausstieg bleiben nutzbar. Kein stiller RPC-Historienersatz, der eine funktionierende MultiBaas-Integration vortäuscht.
- Der Master kann anhand bestätigter Aktivität und aktueller Bestände freie Mittel identifizieren und eine erlaubte Rückholung/Neuallokation ausführen. Eine alte oder unvollständige Historie genügt nicht für die Entscheidung; aktuelle Onchain-Prüfung bleibt verpflichtend.
- MultiBaas erstellt oder verwahrt keine Worker-Schlüssel. Seine optionalen unsignierten Transaktionen und Cloud Wallets sind für unseren MVP nicht notwendig.

### Runtime, Schlüssel und Codex-Plugin

Ein lokaler Companion orchestriert Docker-Worker. Der Mensch autorisiert dessen Root-Operator-Adresse per Wallet-Transaktion. Jeder Worker erhält einen eigenen Schlüssel über einen privaten kurzlebigen Mount sowie eine authentifizierte Verbindung zu seinem MCP-Kontext. Schlüssel erscheinen nicht in Prompts, Tool-Ergebnissen, Logs, Git oder Vercel. Verschlüsselte Schlüssel liegen außerhalb des Projekts. Der lokale Companion entschlüsselt sie mit einem separaten, zufällig erzeugten Passwort in einer nur für den Host-Nutzer lesbaren Datei. Das ermöglicht unbeaufsichtigten Betrieb; die daneben gespeicherte Passwortdatei schützt ausdrücklich nicht vor einem kompromittierten Host oder einem Prozess mit demselben Betriebssystem-Nutzer. Die geprüfte Sicherheitsgrenze ist die Isolation der Worker, keine zusätzliche interaktive Passphrase.

Worker laufen mit Docker `--network none`. Eine Bridge im Container erreicht ausschließlich den workergebundenen Unix-Socket; der Host-Gateway setzt den tatsächlichen MCP-/Inferenzkontext ein. Loopback im Container ist kein Zugriff auf Host-Loopback. Ausgehender allgemeiner Netzwerkzugriff ist gesperrt. Jeder Worker hat eigenen Workspace, Schlüssel und Socket; pro Worker begrenzte Credentials bleiben beim Companion.

Container erhalten weder Host-Home noch vollständiges Codex-Profil/Auth-Verzeichnis, Eltern-/Geschwisterschlüssel oder Docker-Socket. Der Host/Companion ist vertrauenswürdig; Container sind keine Schutzgarantie gegen einen kompromittierten Host. Die Onchain-Vaults begrenzen einen kompromittierten Worker auch bei direktem RPC-Zugriff.

Eigener Spawn-Ablauf statt einer Sicherheitsannahme über natives `spawn_agent`:

1. Authentifizierter Eltern-Worker übergibt Aufgabe, Modell, ERC-20-Kapitalzuweisung (Asset und Betrag), zusätzliche Einschränkungen und Idempotenz-ID.
2. Runtime bereitet Child-Schlüssel/-Adresse vor. Der Aufruf wird fest an den tatsächlichen Elternkontext gebunden; ein modelseitiges agentId-Feld authentifiziert nichts.
3. Der Eltern-Signer autorisiert eine atomare Transaktion für Knoten-/ENS-Erstellung, Rollen und reale Kapitalzuweisung. `spawnChild` enthält einen bytes32-Operationsschlüssel; der Controller speichert dessen Ergebnis getrennt nach Root, Parent und Autoritätsgeneration zusammen mit einem Hash der Spawn-Parameter. Wiederholung identischer Parameter liefert den vorhandenen Knoten ohne erneute Finanzierung; abweichende Parameter zum selben Schlüssel werden abgewiesen. Kinder werden nur aus einem noch gültigen Mandat erzeugt.
4. Runtime wartet auf Bestätigung und gleicht unklare Sendestatus anhand des persistenten Operationsjournals und des Contracts ab. Ein wiederholter Request erzeugt keinen zweiten Child-Vault und keine zweite Zuweisung.
5. Erst dann startet der Worker. Prozessfehler nach Allokation führen zu wiederaufnehmbarem Start oder expliziter Sperrung/Rückholung. Bei einem Reorg wird der Worker gestoppt und der Vorgang erneut abgeglichen.

Eigenes lokales Runtime-Journal speichert Operationsstatus, öffentliche IDs und Workspace-Zuordnung atomar; Modellaufgaben bleiben lokal. Begrenztes Sepolia-ETH-Gas wird getrennt vom Handelskapital zugeteilt und darf kein unbegrenzter Faucet für Worker werden. Root-/Sibling-Schlüssel und unlimitierte Provider-Credentials werden nie weitergereicht.

Auf HomeBox ist CLIProxyAPI der einzige Inferenzanbieter. Worker verwenden diesen über einen vom Companion vermittelten, pro Worker begrenzten Zugang; ein unbeschränkter Host-Master-Key gehört nicht in den Container. Der verbindlich unterstützte Jury-Pfad benötigt zusätzlich einen eigenen erreichbaren CLIProxyAPI-Zugang (Endpoint, Credential und verfügbares Modell). Das Setup fragt diese Angaben lokal ab, prüft einen echten Modellaufruf und speichert das Credential ausschließlich beim Companion. Ein vorhandenes Codex-Login allein genügt dafür nicht; wir versprechen keine ungeprüfte Weitergabe einer Codex-/ChatGPT-Session an Worker. Unsere Demo stellt der Jury weder Host-Zugänge noch Provider-Schlüssel zur Verfügung. Die unabhängige Installation testet diesen expliziten Weg mit frischem Runtime-/Codex-Profil und getrenntem Testzugang.

Codex `SubagentStart`-Hooks existieren, garantieren aber weder isolierte Schlüssel noch eine blockierbare Erstellung. Wir aktivieren keine Hooks. Das Plugin stellt eigene MCP-Werkzeuge und Anleitungen bereit; nicht-interaktive Worker werden über `codex exec --json` gestartet. Ausgewählte CLI-/Plugin-Versionen werden gepinnt und in einem frischen Profil installiert getestet.

### Öffentliche Schnittstellen und Oberfläche

Gemeinsame TypeScript-Typen und generierte Contract-ABIs definieren Node, Policy, TokenAmount, OperationStatus und Activity. Node-IDs sind keine Autorisierungsnachweise. RPC/MultiBaas-Antworten tragen Block-/Quelleninformationen, finanzielle Mengen sind Integer, keine Floats.

SDK/MCP-Funktionen: `createRoot`, `spawnChild`, `allocateCapital`, `getTree`, `getEffectivePolicy`, `getCapitalActivity`, `tightenPolicy`, `swap`, `openPosition`, `increasePosition`, `collectFees`, `closePosition`, `revokeSubtree`, `reclaimAssets`. Operatorbindung und Eigentümer-Notausstieg sind Wallet-Aktionen; Root-Schreibzugriff entsteht nicht durch Verbindung mit der Website.

Graphitfarbene technische Oberfläche, lesbare Kontraste, grüne aktive Verbindungen, klare Beschriftungen für widerrufen/abgelaufen. Startansicht: Demo ansehen, eigenen Vault erstellen, Plugin installieren. Baum: ENS-Namen, Beziehungen, freie Mittel und Mandate. Details: lokale/geerbte Einschränkungen mit Ursprung, Tokenbestände, LP-Position und tatsächliche Transaktionslinks. Aktives Onchain-Mandat bedeutet nicht, dass ein Agentenprozess gerade läuft. Lokale Fehlversuche bleiben als lokale Diagnose gekennzeichnet.

Jury-Voraussetzungen sind Wallet, Sepolia-ETH, Node.js, Docker, Codex und der oben beschriebene eigene CLIProxyAPI-Zugang. Ablauf: Vercel öffnen → eigene Wallet auf Sepolia → eigenen Root erstellen und Demo-Assets beziehen → CLI-Setup/Plugin installieren und Modellzugang testen → Operator per Wallet binden → Aufgabe in Codex → Aktionen im Dashboard verfolgen → Teilbaum widerrufen → LP schließen → Mittel zurückholen. Die Website erfordert keinen Zugriff auf localhost; der Plugin-Client benötigt keinen öffentlichen Server. Für öffentliche Roots deckt unsere gemeinsame MultiBaas-Instanz die Controller-Historie ab ihrem dokumentierten Indexierungsstart ab; die Oberfläche nennt diese Abdeckungsgrenze. Eigene Contract-Deployments benötigen eigene Indexer-Konfiguration. Demo ansehen und manuelle Wallet-Aktionen funktionieren auch ohne Modellzugang.

## 3. Arbeitspakete, Freigaben und Veröffentlichung

Stack: pnpm TypeScript-Workspace; Next.js, shadcn/ui (Base UI), viem mit injiziertem Wallet-Provider und eigener SVG-Baumansicht; Solidity/Foundry; Docker; Playwright mit Chromium und MetaMask für echte Wallet-E2E-Tests. Vorhandene Tools verwenden, fehlendes Foundry lokal und versioniert installieren. Keine Host-Updates oder Aktivierung automatischer Hooks.

| Paket | Inhalt | Abgeschlossen, wenn |
| --- | --- | --- |
| P0 | Plan/Status/Arbeitsregeln; Workspace, Git und CI | Dokumente persistiert; reproduzierbare Basis und Checks vorhanden |
| P1 | ENS-Beta/Namespace, v4, Plugin, Browser-Wallet, Provider und MultiBaas prüfen | Konkrete Versionen/ABIs fixiert; reale Aufrufe und lokale Mint/Collect/Exit-Probe erfolgreich |
| P2 | Verwaltete ENS-Registries und Finance-Rollen | Rollen-/Operator-/Lifecycle-Negativtests bestehen |
| P3 | Kapitalbaum, atomarer Spawn, Notausstieg | Budget-, Vorfahren-, Idempotenz- und Rückholtests bestehen |
| P4 | SDK und gemeinsame Typen | Echte Contract-Integration aus TypeScript funktioniert |
| P5 | Dashboard mit fünf Seiten | shadcn Sidebar, responsive Baum-/Rechteansicht mit Knotendetails, lesbare Typografie, System-Theme und klar markierte Beispieldaten; Wallet-Schutzgrenzen erhalten |
| P6 | Isolierte Runtime und Modellanbindung | Zwei Worker mit verschiedenen Schlüsseln und nachgewiesener Trennung laufen |
| P7 | Codex-Plugin/Installation | Frisches Profil installiert Plugin und erzeugt einen echten Child-Knoten |
| P8 | Begrenzter Uniswap-Swap | Erlaubter Swap gelingt, falsche Inputs/Empfänger scheitern |
| P9 | LP-Lebenszyklus und Widerruf | Mint/Increase/Collect/Close einschließlich Eltern-/Owner-Exit funktionieren |
| P10 | MultiBaas und Live-Dashboard | Reale indexierte Events treiben Historie und MCP-Abfrage; Fehlerfall sichtbar |
| P11 | Unabhängiges Jury-Onboarding | Neue Wallet und frische Runtime benötigen keine Demo-Schlüssel oder privaten Host-Zugänge |
| P12 | Integrations-, Sicherheits- und Browser-Abnahme | Alle verpflichtenden Tests unten bestanden und überprüft |
| P13 | Public Repo, Sepolia, HomeBox-Demo, Vercel, Abgabeartefakte | Öffentliche URLs und unabhängiger Ablauf funktionieren; Sponsorbeiträge nachweisbar |

Abhängigkeiten: P2/P3 fixieren Interfaces für P4. P5 und P6 können nach P1 parallel laufen. P7 hängt von P4/P6 ab. P8/P9 hängen von Contracts/SDK ab. P10 folgt dem Event-Schema und kann parallel zur UI-Integration erfolgen. Deployment-Testläufe beginnen vor P12; P13 ist die geprüfte Veröffentlichung.

Hauptagent verantwortet Architektur, Schnittstellen, Integration und Reviews. Höchstens drei Subagents parallel, je eigene Branch/Worktree und klare Dateiverantwortung. Luna Max übernimmt begrenzte SDK-/Frontend-/Dokumentations-/Testfeatures. Sol Medium übernimmt Contracts, Isolation und Sicherheitsintegration. Änderungen anderer werden nicht zurückgesetzt. Nach jedem Feature relevante Tests, Diff-Review und eigener Commit mit aussagekräftigem Betreff/Begründung. Autor: CodeByNikolas. Kein ungetesteter großer Sammelcommit.

Ziele: öffentliches GitHub-Repository `CodeByNikolas/agent-capital-tree`; neues Vercel-Projekt im Team `tumblockchains-projects`. Veröffentlichung ist bereits autorisiert. Keine Änderungen an bestehenden Projekten. Testschlüssel und private Runtime-Daten bleiben außerhalb des Repositorys; Logs/Screenshots werden auf Secrets geprüft.

### Technische Freigaben vor Integrationsversprechen

1. ENS: nutzbarer Sepolia-Namespace, tatsächliche ABI-/Source-Kompatibilität, atomare Registrierung/Rolleninitialisierung und Registry-Verknüpfung. EAC kann nicht still durch Metadaten oder eine unabhängige ACL ersetzt werden.
2. Uniswap: deployed Bytecode/ABIs, Testpool, lokale und anschließend Sepolia Swap-/LP-Probe. Fehlende Liquidität lösen wir durch eigenen Pool; fehlt ein nutzbarer Contract, ist die Freigabe offen.
3. Runtime: aktuelles Plugin-Paketformat, Modellverfügbarkeit und per-Worker-Inferenzzugang ohne geteilte Host-Credentials; echte Containertrennung. Keine stillschweigende Rückkehr zu gemeinsamem Parent-Key.
4. Wallet: gepinnte MetaMask-Version im persistenten Playwright-Chromium-Profil, Verbindung und echte Sepolia-Signatur. Ein Mock-Wallet-Test ersetzt diesen Nachweis nicht.
5. MultiBaas: Sepolia-Instanz, Daten-API-Key, ABI-Link, Indexierungsstart innerhalb des kostenlosen100-Block-Fensters und live ausgeführte Query; der frische Abnahme-Root muss vollständig nach diesem Start liegen. Fehlt der Zugang, bleibt diese Integration offen; die Anwendung und Notausstieg können unabhängig weitergebaut werden.

Sind Freigaben nicht erfüllt, den konkreten Hinderungsgrund in STATUS.md festhalten. Parallele unabhängige Arbeit fortsetzen; den Umfang nicht still reduzieren oder erfolgreiche Integration behaupten. Neue Produktentscheidungen sind nur bei tatsächlichem Wegfall einer Kernvoraussetzung nötig.

## 4. Test- und Abnahmeplan

### Contracts und Sicherheit

- Neue Finanzabläufe zuerst auf einem wegwerfbaren lokalen Sepolia-Fork prüfen. Erst danach öffentliches Sepolia für echte Wallets, MultiBaas-Indexierung und die veröffentlichte App nutzen; ein Fork ersetzt diese externen Integrationsnachweise nicht. Keine zweite Entwicklungsplattform dafür aufbauen.
- Kapital bleibt über Transfers erhalten; kein Double-Spend, keine Doppelallokation bei wiederholtem Spawn. Ein Child kann weder Root-/Sibling-Bestände noch deren Freigaben verwenden.
- Kindregeln werden ausschließlich enger. Vorfahreneinschränkung und Widerruf wirken auf vorhandene Nachfahren, ein Sibling bleibt unabhängig.
- Direkte RPC-Aufrufe und frei gefälschte MCP-IDs umgehen keine Autorisierung. Resource-Wechsel, Ablauf, Detachment, Namens-/NFT-Transfers und Operator-Approvals erweitern keine Finance-Rechte.
- ENS-Ausfall oder ungültiger Pfad blockiert normale Aktionen; der menschliche Owner kann verbleibende Assets einschließlich LP zurückholen. Projektoperator und ehemalige Root-Operatoren können dies nicht.
- LP-NFT bleibt im Vault; Gebührenabholung entnimmt keinen Principal; alle Auszahlungen gehen an gebundene Vaults. Ein Widerruf sperrt Management und lässt den vorgesehenen Notausstieg zu.
- Manipulierte Routerdaten, falsche Tokens/Pools/Empfänger, zu hohe Beträge, abgelaufene Deadlines, Callback-/Reentrancy-Versuche und unerlaubte Freigaben scheitern.
- Unit- und Foundry-Fuzztests prüfen Invarianten, eine reale v4-Integration prüft den Protokoll-Lebenszyklus. Negative Tests greifen Contracts direkt an, nicht nur die UI.

### Runtime und Daten

- Frische Installation, zwei isolierte Worker, Parent-/Sibling-Schlüssel und Docker-Socket unzugänglich; keine Provider-Master-Credentials im Worker.
- Bestätigte, fehlgeschlagene, doppelte und zunächst unklare Transaktionen; Worker-Startfehler nach Allokation; Prozessneustart, Verlust des lokalen Journals und Reorg erzeugen bei Wiederholung desselben Operationsschlüssels keine zweite Zahlung. Bei verlorenem Schlüssel muss vor einer neuen Spawn-ID der Onchain-Baum abgeglichen werden.
- MultiBaas-Events stimmen mit Receipts überein; Duplikate/Reorgs werden bereinigt; Indexierungsverzug/API-Ausfall täuscht keine aktuellen Bestände oder erfolgreiche Integrationen vor.
- Root-Aggregate zählen interne Transfers nicht doppelt. Fremde Direktzahlungen erscheinen über aktuelle Balances. Fehlgeschlagene Aktionen werden nicht als Onchain-Events erfunden.
- Master liest Historie und aktuelle Bestände, holt tatsächlich freie Mittel zurück und allokiert sie unter gültigen Rechten neu. Nicht dokumentierte Cloud-Automation ist keine Voraussetzung.

### Echter End-to-End-Test auf der veröffentlichten Vercel-App

Separate Deployment- und Nutzer-Testkonten werden neu erzeugt und außerhalb des Repositories geschützt gespeichert. Der Nutzer erhält nur öffentliche Funding-Adressen und den geschätzten Sepolia-ETH-Bedarf. MetaMask-Einrichtung/Seed-Import wird nicht aufgezeichnet. Browserbase ergänzt öffentliche UI-Tests; Wallet-Signaturen laufen im separaten lokalen Browserprofil.

1. Frische Wallet verbinden, Sepolia auswählen, Root erstellen, Demo-Token beziehen und finanzieren.
2. Frisches Codex-Profil und Plugin installieren; eigene Runtime starten und Operator über die Wallet binden.
3. Master delegiert Kapital an Child und Grandchild mit engeren Rechten; Dashboard zeigt reale ENS-Verbindungen und effektive Policy.
4. Erlaubter Swap sowie LP-Eröffnung/-Vergrößerung gelingen. Kontrollierter zusätzlicher Swap erzeugt Gebühren, Gebührenabholung wird geprüft.
5. Überschreitung, unerlaubtes Asset und Rechteausweitung scheitern; mindestens ein negativer direkter Onchain-Aufruf belegt Enforcement.
6. Teilbaum widerrufen; Nachfahren können nicht weiter handeln. Geschwister-Vault bleibt nutzbar.
7. Runtime stoppen; Owner schließt die bestehende LP-Position und holt verbleibende Assets zurück.
8. Website neu laden; Zustand, Historie und Explorer-Receipts stimmen überein. MultiBaas-Ausfall verhindert Notausstieg nicht.

Zusätzlich mobile Darstellung, Tastaturbedienung, lesbare Zustände, abgelehnte Wallet-Anfragen, falsches Netzwerk und RPC-Ausfälle testen. Ergebnisbericht nennt Commit, Vercel-Deployment, Contract-Adressen, Versionen, Transaktionsnachweise und bereinigte Screenshots. Keine Fertigmeldung allein aufgrund erfolgreicher Builds oder Mock-Demos.

## 5. Voraussetzungen, Nachweise und Quellen

Bereits verifiziert: GitHub-Login CodeByNikolas, Vercel-Zugriff auf TUM Blockchain Club, Node/pnpm/Docker/Codex, lokales Playwright-Chromium/Xvfb und Browserbase-Zugang. Foundry muss projekt-/nutzerlokal bereitgestellt werden. Zugang ist kein Nachweis, dass die neue Anwendung bereits existiert.

Sepolia-Funding für den frischen MultiBaas-Abnahme-Root ist eingegangen. ENS-Registrierung, Instanz-URL, administrative Ersteinrichtung und eingeschränkter Laufzeit-Key sind vorhanden; tatsächliche Nachweise und offene Schritte stehen in STATUS.md. Einen dedizierten RPC nur bei nachgewiesenem Bedarf ergänzen. Uniswap-API-Key ist für direkte Contracts nicht nötig. Keine persönlichen Seed-Phrases anfordern und keine Modellzugänge anderer Anbieter auf HomeBox einrichten.

Abgabe: öffentliche Contracts/Tests/Doku, klare Setup-Anleitung, Team-/Social-Angaben vom Team, eindeutige Codeverweise pro Partner. Uniswap benötigt FEEDBACK.md und Developer Feedback Form mit Link darauf. Curvegrid benötigt README mit Projektsatz, Setup/Tests und ehrlichem MultiBaas-Erfahrungsbericht. ETHGlobal-Abgabe und Feedback-Formular nicht ohne tatsächliche erfolgreiche Übermittlung als erledigt markieren; fehlende Teamangaben erst am entsprechenden Schritt anfordern.

Primärquellen (am 25.09.2026 recherchiert; live ABI/Deployments bleiben P1):

- ENSv2 EAC: https://docs.ens.domains/ensv2/enhanced-access-control/
- ENSv2 Registry: https://docs.ens.domains/ensv2/permissioned-registry/
- ENS-Quellstand: https://github.com/ensdomains/contracts-v2/tree/48b3e2d39513b9dd32ef1850877a29009bc807b9
- Uniswap v4 Deployments: https://developers.uniswap.org/docs/protocols/v4/deployments
- v4 Periphery: https://github.com/Uniswap/v4-periphery/tree/9969eec44cfdf07e24b41de47f40276a58401976
- v4 Core: https://github.com/Uniswap/v4-core/tree/46c6834698c48bc4a463a86d8420f4eb1d7f3b75
- MultiBaas Contract-Verwaltung: https://docs.curvegrid.com/multibaas/manage-contracts
- MultiBaas Event Queries: https://docs.curvegrid.com/multibaas/event-indexing
- MultiBaas API: https://docs.curvegrid.com/multibaas/api/
- Offizielles Sepolia-/Wallet-/Indexing-Beispiel: https://github.com/curvegrid/matsuri-stablecoin-sample-app
- Curvegrid-Ausschreibung: https://ethglobal.com/events/tokyo2026/prizes/curvegrid
- ENS-Ausschreibung: https://ethglobal.com/events/tokyo2026/prizes/ens
- Uniswap-Ausschreibung: https://ethglobal.com/events/tokyo2026/prizes/uniswap-foundation
- Uniswap Feedback: https://developers.uniswap.org/hackathon-feedback
- Codex Hooks: https://learn.chatgpt.com/docs/hooks
- Codex Plugins: https://developers.openai.com/plugins/build/plugins
- Playwright Extensions: https://playwright.dev/docs/chrome-extensions

Abschlussdefinition: Public Repository, echte ENS-/Uniswap-/MultiBaas-Integration, unabhängige Plugin-Installation und vollständiger getesteter Nutzerablauf auf Vercel. Der Plan ist entscheidungsreif; die Implementierung ist erst nach diesen Nachweisen fertig.
