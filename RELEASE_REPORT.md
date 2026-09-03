# NOVA Casino — Release Report

Stand: 03.09.2026 · Branch `claude/nova-casino-handoff-4qa406`

Dieser Report ist die Abschlussantwort des Masterprompts aus
`NOVA-Casino-Claude-Code-Handoff.md`. Er behauptet keinen Test, der nicht tatsächlich
gelaufen ist — jede Zahl unten ist entweder aus `AUDIT.md`, `RTP_REPORT.md`, einem
committeten Testskript unter `tests/`, oder aus einem in dieser Session direkt
ausgeführten Befehl.

## 1. Was geändert wurde

Ausgangspunkt: `nova-casino.html` (V6.4 Pro Polish, aus den bereitgestellten Uploads,
141.280 Bytes/958 Zeilen — identisch mit der im Handoff-Dokument beschriebenen
kanonischen Datei). Vollständiger Audit vor jeder Änderung: `AUDIT.md`.

- **Gastmodus tatsächlich spielbar gemacht** (`AUDIT.md` B1): `spin()` und
  `executeGamble()` liefen bisher in einen `throw`, sobald kein Account eingeloggt war.
  Beide laufen jetzt bei fehlendem Login vollständig lokal — mit denselben
  Mathematik-Modulen (`generateSpin`/`generateFruitSpin`/`generateFancySpin`/
  `generateBookSpin`), demselben `crypto.getRandomValues()`-RNG und derselben
  Präsentations-/Settlement-Pipeline wie der Server-Pfad. Kartenrisiko und
  Leiterrisiko lösen lokal auf (`resolveLocalGamble()`, nutzt die zuvor bereits
  vorhandene, aber ungenutzte `localCard()`-Hilfsfunktion).
- **Reload-/Lifecycle-Sicherheit** (`AUDIT.md` B2, B3, M4): `boot()` hat bisher nur
  eine unbeantwortete Server-Anfrage (`pendingRequest`) wiederhergestellt, nicht ein
  bereits beantwortetes, aber unpräsentiertes Ergebnis (`pendingSpin`) — ein Reload in
  diesem Fenster ließ Guthaben/Statistik dauerhaft unabgeschlossen liegen. Behoben:
  `boot()` ruft jetzt `resumePending()`/`resumeGambleAction()` unabhängig vom
  Login-Status auf. Neue zentrale `forceCompleteSpin()`-Routine (idempotent, geschützt
  durch die bereits vorhandene `pendingSpin.id`-Prüfung in `applySpinSettlement()`)
  wird von Boot-Recovery, `visibilitychange`, einem neuen 9-Sekunden-Animations-
  Watchdog und defensiv vor jedem neuen Spin verwendet, falls ein alter Spin noch
  unabgeschlossen in `localStorage` liegt. `animateSpin()` erhält einen kooperativen
  Abbruch-Token (`ctrl.aborted`), der nach jedem `await sleep()` geprüft wird, damit
  der Watchdog eine hängende Animation sauber stilllegen kann.
- **Netzwerk-Timeouts**: `AbortController` + 12s-Timeout in `publicFetch`/`authFetch`
  (vorher: unbegrenztes Warten auf eine hängende `fetch()`).
- **Versionsinkonsistenz behoben** (`AUDIT.md` H1, plus H4b-Fund): `BUILD_VERSION`
  6.3.0 → 6.4.0 mit Storage-Key-Migration (`nova-v63-*` → `nova-v64-*`,
  rückwärtskompatibler Lesepfad); zusätzlich zwei bislang unentdeckte, weitere
  Versionsangaben im Markup korrigiert ("V6.4 PRO POLISH · SERVER-MODUS"-Banner,
  "CASINO · BETA 6.3" im Header-Logo).
- **Konkreter Touch-Target-Bug behoben** (`AUDIT.md` B4), gefunden durch einen echten
  Playwright-Lauf auf 393×852 (iPhone 15 Pro): Die rein dekorative Kartenvisualisierung
  im Kartenrisiko lag über dem "NEHMEN"-Button und blockierte ihn vollständig
  (`pointer-events:none` behebt es ohne jede optische Änderung).
- **PWA-Hülle ergänzt** (`AUDIT.md` Phase-8-Lücke): `manifest.webmanifest`,
  `service-worker.js` (versionierter App-Shell-Cache, rührt jede Supabase-Anfrage
  nachweislich nicht an), eigenständiges Icon-Set aus dem bereits vorhandenen
  NOVA-Hai-SVG. `nova-casino.html` bleibt direkt per Doppelklick lokal spielbar
  (Service-Worker-Registrierung ist auf `https:`/`localhost` beschränkt).
- **Barrierefreiheit** (gefunden durch einen echten Lighthouse-Lauf, `AUDIT.md` H4b):
  Pinch-Zoom wieder erlaubt, `aria-label`/sichtbarer-Text-Widerspruch am
  Logo-Button behoben, Meta-Description ergänzt.
- **Presence-Punkt korrigiert** (`AUDIT.md` H3): zeigte zuvor unabhängig vom
  tatsächlichen Verbindungsstatus immer Grün; jetzt an `backend.isAuthenticated`
  gekoppelt.
- **Dev-Banner** standardmäßig ausgeblendet, nur sichtbar mit `?debug=1` (`AUDIT.md` H2).
- **Nicht verändert, bewusst dokumentiert**: Freundes-Aktivitätsfeed zeigt weiterhin
  Beträge (`AUDIT.md` M2, Produktentscheidung, nicht angetastet); Spielmathematik aller
  vier Spiele unverändert (siehe `RTP_REPORT.md` — Abweichungen dokumentiert, nicht
  wegkalibriert); 11 bestehende leere `catch{}`-Blöcke unverändert belassen (`AUDIT.md`
  M1), da sie überwiegend bewusste Best-Effort-Fallbacks sind und ihre Änderung ein
  neues Fehlerrisiko ohne im Auftrag stehenden Nutzen wäre.

## 2. Behobene Fehlerursachen (Kurzfassung mit Belegen)

| # | Ursache | Beleg |
|---|---|---|
| B1 | Gastmodus wirft `throw`, statt lokal zu rechnen | `tests/smoke.js`: 19/19 PASS, inkl. "guest spin did NOT show login-required toast" |
| B2 | `boot()` stellt `pendingSpin` nicht wieder her | `tests/settlement-invariant.js`: 12/12 PASS über 10 Reload-Zyklen |
| B3 | Kein Watchdog für hängende Animation | `soak.js`-Lauf: 0 "Stuck/timeout occurrences" über 324 tatsächlich abgeschlossene Spins |
| B4 | Kartenvisualisierung blockiert "NEHMEN" | `tests/smoke.js`: "NEHMEN button is actually clickable" PASS (vorher reproduzierbar FAIL) |
| H1/H4b | Drei widersprüchliche Versionsangaben | Lighthouse-Lauf deckte die dritte auf; alle drei per Grep verifiziert behoben |
| H4b | Accessibility-Score 93 → 100 | Lighthouse JSON vorher/nachher, siehe unten |

## 3. Tests, die tatsächlich gelaufen sind, mit Ergebnissen

Alle Skripte liegen unter `tests/` und `sim/` im Repository und sind mit den in
`README.md` angegebenen Befehlen reproduzierbar.

### Playwright-Smoke-Test (`tests/smoke.js`, Chromium, Viewport 393×852)
19/19 Assertions PASS: Gastmodus-Spin ohne Login-Fehlermeldung, Guthaben ändert sich,
Spin-Button wird zuverlässig wieder freigegeben, keine hängengebliebenen
Blur/In-Motion-Klassen, Turbo-Modus, Reload-mitten-im-Spin-Recovery (Statistik
erhöht sich exakt um 1, Button wieder nutzbar, keine Restklassen), lokales
Kartenrisiko (Fruit Reactor) inkl. tatsächlich klickbarem "NEHMEN"-Button und
Gutschrift, lokales Leiterrisiko (Fancy Harvest), null unbehandelte Konsolenfehler
über den gesamten Lauf.

### Settlement-Invarianten-Test (`tests/settlement-invariant.js`)
12/12 Assertions PASS: 10 Reload-Zyklen mit variierendem Unterbrechungszeitpunkt
mitten im Spin, danach jeweils `balanceCents === initialBalance − wageredCents +
wonCents` und `pendingSpin === null`; zusätzlich nach 5 regulär durchgespielten Spins.

### Soak-Test (`tests/soak.js`, 4 Spiele × bis zu 125 Spins, Turbo-Modus)
- Tatsächlich abgeschlossene Spins: 324 (Rest der 500 Versuche waren Warte-/
  Gamble-Auflösungsschritte innerhalb der Schleife, keine Fehlschläge)
- Hängengebliebene Zustände: **0**
- Negatives Guthaben beobachtet: **nie**
- DOM-Knotenzahl Start → Ende: 391 → 352 (kein Wachstum)
- Konsolenfehler: **0**
- `pendingSpin` am Ende: `null` (vollständig abgerechnet)

### PWA-/Offline-Test (`tests/pwa-offline.js`, über echten HTTP-Server, nicht `file://`)
6/6 Assertions PASS: Service Worker registriert und aktiv, Manifest korrekt verlinkt
und valide (Name + ≥2 Icons), Gastmodus-Spin über HTTP, Seite lädt mit
`context().setOffline(true)` weiterhin (gecachte App-Shell), **Gastmodus-Spin
funktioniert vollständig offline nach dem ersten Laden**.

### Lighthouse (echter Lauf gegen `http://localhost:8934/nova-casino.html`, Chromium headless, Desktop-Preset)
Vorher: Performance 100, Accessibility 93, Best Practices 100, SEO 90.
**Nachher (nach den Fixes in diesem Report): Performance 100, Accessibility 100,
Best Practices 100, SEO 100 — null verbleibende binäre Audit-Fehlschläge.**
Hinweis: Lighthouse ≥10 führt keine eigene "PWA"-Kategorie mehr; Installierbarkeit/
Offline-Fähigkeit wurde stattdessen funktional über `tests/pwa-offline.js` verifiziert.

### Statische Prüfungen (Node, `new Function()` auf dem extrahierten Script-Block)
JS-Syntax fehlerfrei nach jeder Änderung erneut geprüft. 75 IDs, keine Duplikate,
74 `$('#id')`-Aufrufstellen (2 mehr als im Ausgangszustand durch die neuen
`onlineDot`/`connectionBadge`-Verdrahtung), alle referenzierten IDs vorhanden.

## 4. Gemessene RTP-Werte

Vollständige Tabellen, Methodik und Bewertung: `RTP_REPORT.md`. Kurzfassung
(gepoolt über 5 Seeds à 1.000.000 Spins = 5.000.000 Spins je Spiel):

| Spiel | Ziel-RTP | Gemessen (5 Mio. Spins) | Δ |
|---|---|---|---|
| Shark Abyss | 88,43 % | 88,384 % | −0,046pp |
| Fruit Reactor | 88,63 % | 88,284 % | −0,346pp |
| Fancy Harvest | 88,22 % | 87,667 % | −0,553pp |
| Tomb of Kings | 87,25 % | 86,241 % | −1,009pp |

Fancy Harvest und Tomb of Kings weichen **systematisch** (nicht zufällig) vom
ausgewiesenen Wert ab; Ursachen benannt und Spielmathematik dabei **nicht** verändert
(siehe `RTP_REPORT.md` „Bewertung“). Finale 5.000.000-Spins-Kalibrierung pro Seed lief
zusätzlich im Hintergrund — Ergebnis siehe `RTP_REPORT.md`/`sim/rtp-results-5m.json`,
falls zum Zeitpunkt des Lesens fertig.

## 5. Verbleibende bekannte Einschränkungen

Diese sind bewusst nicht als erledigt behauptet:

1. **Kein echtes iPhone verfügbar.** Sämtliche iOS-/Safari-Aussagen in `AUDIT.md` und
   diesem Report beruhen auf Code-/Timer-Semantik-Analyse, nicht auf einer Messung auf
   echter Hardware. Die reale iPhone-Checkliste aus Phase 7 des Masterprompts ist damit
   **nicht** abgehakt.
2. **Kein Zugriff auf das referenzierte Supabase-Projekt.** Ob die erwarteten RPCs und
   Edge Functions (`/functions/v1/spin`, `/functions/v1/gamble`, `client_sync_snapshot`
   usw.) serverseitig existieren, korrekt sind und dieselbe Mathematik wie der Client
   verwenden, konnte nicht verifiziert werden — es gab keinen `supabase/`-Ordner im
   Projekt. Der Online-Modus bleibt daher ein dokumentierter, nicht schließbarer
   Blocker in dieser Session.
3. **Kein Deployment.** Diese Umgebung hat keinen konfigurierten Vercel-/GitHub-Pages-
   Zugang; ein Push zum GitHub-Repository selbst schlug fehl (siehe Abschnitt 7). Es
   gibt daher **keinen** Preview- oder Produktionslink zu diesem Report.
4. **11 leere `catch{}`-Blöcke unverändert** (AUDIT.md M1) — funktional meist
   vertretbare Best-Effort-Fallbacks, aber ohne Logging, was künftige Fehlersuche
   erschwert.
5. **Kein Max-Win-Cap in der Spielmathematik gefunden** (siehe `RTP_REPORT.md`) — als
   Produktentscheidung markiert, nicht in dieser Session ergänzt.
6. **RTP-Abweichungen bei Fancy Harvest/Tomb of Kings** sind dokumentiert, aber nicht
   "korrigiert" — eine bewusste Entscheidung erfordert, ob die UI-Texte oder die
   Kalibrierungsfaktoren angepasst werden (siehe `RTP_REPORT.md`).
7. **Kein automatisierter WebKit/Safari-Lauf.** Alle Browsertests liefen unter
   Chromium (Playwright); ein WebKit-Lauf war in dieser Umgebung nicht Teil der
   ausgeführten Tests (Playwright bringt WebKit grundsätzlich mit, wurde hier aber
   nicht zusätzlich verifiziert) — das ersetzt nicht Punkt 1.
8. **Freundes-Feed-Beträge** unverändert als bestehende Produktentscheidung belassen
   (AUDIT.md M2) — keine neue Konfigurierbarkeit ergänzt, um keine ungefragte
   Verhaltensänderung einzuführen.

## 6. Pfad zur direkt öffnungsfähigen HTML

`nova-casino.html` im Repository-Root. Doppelklick bzw. `file://`-Öffnen genügt für den
vollständigen Gastmodus (siehe README.md „Schnellstart“).

## 7. Deployment

Kein Preview- oder Produktionslink. Diese Session hat GitHub-Zugriff nur eingeschränkt:
`git push` zum konfigurierten Branch `claude/nova-casino-handoff-4qa406` schlug mit
`403` fehl ("Claude doesn't have GitHub access to ricobttchr/New-casino for your
organization") — ein Org-Admin müsste die Claude-GitHub-App installieren bzw. die
GitHub-Verbindung erneut autorisieren. Vercel/GitHub-Pages-Zugang war in dieser
Umgebung nicht konfiguriert. Alle Commits liegen lokal im Repository vor und sind
push-bereit, sobald der Zugriff besteht.

## 8. iPhone-Installationsanleitung (Kurzfassung)

Siehe README.md „iPhone-Installation“ — Standard-Safari-„Zum Home-Bildschirm“-Ablauf,
in dieser Session nicht auf echter Hardware verifiziert (siehe Einschränkung 1).
