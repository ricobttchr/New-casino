# NOVA Casino

Ein kostenloser Social-Casino-Simulator mit vier eigenständigen Slots (Shark Abyss,
Fruit Reactor, Fancy Harvest, Tomb of Kings). **Alle Einsätze und Guthaben sind reine
Simulationswerte ohne Geldwert.** Es gibt keine Einzahlung, keine Auszahlung, keinen
Kauf und keine Verbindung zu Echtgeldcasinos.

Für den vollständigen Entwicklungsstand, alle Fundstellen und offenen Punkte siehe
[`AUDIT.md`](AUDIT.md), [`RTP_REPORT.md`](RTP_REPORT.md) und
[`RELEASE_REPORT.md`](RELEASE_REPORT.md).

## Schnellstart (lokal, ohne Build)

`nova-casino.html` ist eine einzelne, direkt öffnungsfähige Datei. Sie doppelt
anklicken oder:

```bash
open nova-casino.html          # macOS
xdg-open nova-casino.html      # Linux
```

Das reicht für den **vollständigen Gastmodus**: Spin, Freispiele, Mystery/Algen,
Expanding Symbol, Kartenrisiko und Leiterrisiko funktionieren ohne Account, ohne
Internetverbindung und ohne Server — der Client führt dieselbe Mathematik lokal aus
(`crypto.getRandomValues()`), die auch der Server-Pfad verwendet (`js/game-math.js`,
`js/fruit-math.js`, `js/fancy-math.js`, `js/book-math.js`, direkt im `<script>` von
`nova-casino.html`).

Für die volle PWA-Erfahrung (Manifest, Service Worker, Icons, Offline-Start) muss die
Datei über einen echten HTTP(S)-Ursprung ausgeliefert werden — Service Worker
funktionieren nicht unter `file://`. Lokal reicht z. B.:

```bash
npx http-server .
# dann http://localhost:8080/nova-casino.html öffnen
```

## Projektstruktur

```
nova-casino.html                          kanonische App (V6.4 Pro Polish)
NOVA-Casino-v6-Premium-Preview-FIXED.html Referenz für den lokalen Gastmodus (V6.1) —
                                           nicht die Hauptquelle, siehe Handoff-Dokument
manifest.webmanifest                      PWA-Manifest
service-worker.js                         App-Shell-Cache, rührt Supabase-Requests nie an
icons/                                    eigenständiges NOVA-Icon-Set (siehe AUDIT.md H5)
sim/rtp-simulator.js                      Monte-Carlo-RTP-Simulator (extrahiert die
                                           kanonische Mathematik direkt aus nova-casino.html)
sim/rtp-results-1m.json                   1.000.000 Spins × 5 Seeds je Spiel
sim/rtp-results-5m.json                   5.000.000 Spins finale Kalibrierung (falls vorhanden)
legacy/noir-private-club-legacy.html      unabhängiger, nicht zu NOVA gehörender Alt-Code
                                           aus dem ursprünglichen Repository, unverändert
                                           aufbewahrt (kein NOVA-Bestandteil)
AUDIT.md / RTP_REPORT.md / RELEASE_REPORT.md
```

## Gastmodus vs. Accountmodus

Die App hat zwei ehrliche, klar getrennte Betriebsarten (siehe `AUDIT.md` B1 für den
Ausgangszustand vor dieser Session):

- **Gastmodus** (kein Login): läuft vollständig lokal, `LocalCasinoStore`
  (`localStorage`, Key `nova-casino-state-v2`), eigener `crypto.getRandomValues()`-RNG,
  keine erfundenen Freunde/Live-Events. Aktiv, sobald `backend.isAuthenticated===false` —
  das ist der Standardfall ohne konfiguriertes/erreichbares Supabase-Projekt oder ohne
  eingeloggten Account.
- **Accountmodus** (eingeloggt): serverautoritative Spins über
  `/functions/v1/spin` und `/functions/v1/gamble`, Wallet-/Statistik-Sync, Freunde,
  Presence. Erfordert das in `nova-casino.html` referenzierte Supabase-Projekt
  (`window.NOVA_CONFIG`).

## Backend / Supabase

Diese Session hatte **keinen Zugriff** auf das im Code referenzierte Supabase-Projekt
und im Repository lag kein `supabase/`-Ordner mit Migrationen oder Edge Functions vor.
Das Frontend erwartet serverseitig:

- Auth (E-Mail/Passwort) über die Standard-Supabase-Auth-Endpunkte
- RPCs: `client_sync_snapshot`, `find_profile_by_friend_code`, `accept_friendship`,
  `release_player_device`, `log_client_error`
- Edge Functions: `/functions/v1/spin`, `/functions/v1/gamble` — beide serverseitig
  validierend, RNG-ausführend, idempotent (Idempotency-Key wird vom Client mitgeschickt)
- RLS auf allen betroffenen Tabellen, sodass der Client niemals Guthaben oder
  Spinresultate autoritativ setzen kann

Ist das Backend nicht erreichbar oder nicht konfiguriert, bleibt die App im
Gastmodus voll funktionsfähig; es wird nirgends stillschweigend lokales und
serverseitiges Guthaben vermischt (`backend.isRemote` vs. `backend.isAuthenticated`
werden im UI unterschiedlich angezeigt: OFFLINE / LOGIN / LIVE, siehe
`#connectionBadge`).

## Audio: ehrliche iOS-Einschränkungen

Die Audio-Engine (`ensureAudioGraph()`/`tone()`/`sweep()`/`soundFx()` in
`nova-casino.html`) verwendet ausschließlich prozedural erzeugte Web-Audio-Oszillatoren
über eine Bus-Architektur (Master → Limiter → UI-/Reel-/Win-/Feature-/Music-Bus) — kein
externes Audio, keine Dateien, nichts, was offline fehlen könnte. Was in dieser Session
**nicht** auf echter Hardware verifiziert werden konnte:

- **Kopfhörer- vs. Lautsprecherverhalten**: nicht unterscheidbar/testbar ohne echtes Gerät.
- **iOS-Lautlosmodus (Klingelschalter)**: iOS dämpft `AudioContext`-Ausgabe je nach
  Systemkategorie unterschiedlich; nicht in einem Chromium-Headless-Test nachstellbar.
- **Eingehender Anruf / echter Audio-Fokusverlust**: Der Code behandelt
  `visibilitychange` (Context wird suspended/resumed, siehe `tests/audio-engine.js`),
  aber ein echter iOS-Interruption-Event (`interruptionbegan`/-`ended`) existiert nur auf
  echter Hardware.
- **`navigator.vibrate()` ist auf iOS Safari grundsätzlich nicht implementiert** — die
  App behandelt Haptik daher als reinen Bonus für Android/andere Browser, niemals als
  garantiertes Feedback. Kein UI-Text im Produkt behauptet etwas anderes.

Was tatsächlich mit Playwright/Chromium verifiziert wurde: AudioContext wird nicht vor
der ersten Nutzerinteraktion erzeugt, Sound-Aus schaltet den Master-Bus sofort auf 0
(nicht nur neue Töne blockiert), ein Limiter sitzt vor der Ausgabe, und alle fünf Busse
existieren — siehe `tests/audio-engine.js`.

## Tests, die in dieser Session tatsächlich gelaufen sind

Alle Ergebnisse in `RELEASE_REPORT.md` sind aus echten Läufen, keine Behauptungen ohne
Beleg. Voraussetzung: `npm install -g playwright` (oder `npx playwright install
chromium`) und Node ≥ 18. Reproduzierbar mit:

```bash
# Monte-Carlo-RTP-Simulation (reines Node, keine Abhängigkeiten)
node sim/rtp-simulator.js 1000000 sim/rtp-results-1m.json

# Browser-Smoke-Test: Gastmodus-Spin, Reload-mitten-im-Spin-Recovery,
# lokales Kartenrisiko/Leiterrisiko, Konsolenfehler (Chromium, file://)
node tests/smoke.js nova-casino.html

# Soak-Test: viele Spins über alle vier Spiele, prüft auf hängende Zustände,
# negatives Guthaben und DOM-Wachstum
node tests/soak.js nova-casino.html 125

# PWA/Offline-Test: Service Worker, Manifest, Spin komplett offline nach
# Erstladen — braucht einen echten HTTP-Server (Service Worker laufen nicht
# unter file://)
npx http-server . -p 8934 &
node tests/pwa-offline.js http://localhost:8934
```

Optional: `PW_CHROMIUM_PATH=/pfad/zu/chromium` setzen, falls Playwright den
Browser nicht selbst mitbringt.

## Bekannte Einschränkungen

Siehe `AUDIT.md` Abschnitt "Nicht abschließend geprüft" und `RELEASE_REPORT.md`
Abschnitt "Verbleibende bekannte Einschränkungen" — insbesondere: kein echtes iPhone
in dieser Umgebung verfügbar (alle iOS-Aussagen sind Code-/Timer-Semantik-Analyse,
keine Hardware-Messung), kein Zugriff auf das referenzierte Supabase-Projekt, kein
Deployment (kein GitHub/Vercel-Zugang in dieser Umgebung konfiguriert).

## iPhone-Installation (sobald deployt)

1. Seite in Safari öffnen.
2. Teilen-Symbol → "Zum Home-Bildschirm".
3. App-Icon erscheint mit dem NOVA-Hai-Icon; Start öffnet die App im
   Standalone-Modus (kein Browser-Chrome), Safe Areas werden respektiert.
4. Gastmodus funktioniert direkt; ein Account ist optional über das Profil-Icon.

Diese Anleitung ist Standardverhalten für ein korrekt verlinktes Web-App-Manifest;
sie wurde in dieser Session nicht auf einem realen iPhone verifiziert (kein Gerät
verfügbar) — siehe Einschränkungen oben.
