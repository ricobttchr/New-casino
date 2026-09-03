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
- **Phase 4 — echte Reel-Strip-Motion nachgerüstet**: Die Spin-Präsentation zeigte
  bisher wiederholt volle Zufallsraster (`renderRandomFrame()`-Schleife) statt echter
  rotierender Streifen. Ersetzt durch pro Walze eine echte vertikale Strip-Animation
  (Web Animations API, eine Timeline pro Reel: Anziehen → konstante Geschwindigkeit →
  Bremsen → kontrollierter Overshoot → Settle), gebaut aus den echten gewichteten
  Symbol-Generatoren plus dem bereits erzeugten Ergebnis am Ende des Streifens — landet
  pixelgenau auf dem mathematischen Resultat. Nur `transform`/`filter` im Animationspfad,
  Blur nur während der Cruise-Phase und in Turbo/Reduced-Motion komplett deaktiviert.
  Jede gelandete Walze wird sofort auf dieselbe statische DOM-Struktur umgeschaltet, die
  `renderGrid()` immer schon erzeugt hat — Algen-Countdown, Expanding Symbol, Paylines
  und Gewinnmarkierung bleiben dadurch unverändert und ungefährdet.
  Dabei gefunden (echter Screenshot im Pflicht-Viewport Landscape 852×393): das
  Walzenraster war dort vollständig abgeschnitten — behoben mit einer neuen
  `@media(max-height:460px)`-Regel, mit Screenshots auf einem 4-Reihen- und einem
  3-Reihen-Spiel verifiziert (`AUDIT.md` B5).
  Anschließend `/code-review` durchgeführt: 3 Funde (verschwendete Filler-Grid-Generierung,
  nicht abgebrochene Web-Animations beim Watchdog-Abbruch, weggefallener Spin-Tick-Sound
  durch den Umbau) — alle behoben und mit erneuten Testläufen verifiziert (`smoke.js`
  19/19, `soak.js` 346 abgeschlossene Spins, 0 Hänger, 0 Konsolenfehler).
- **Phase 5 (teilweise) — messbare Accessibility-/Layout-Punkte**: `tests/touch-targets.js`
  (echter Playwright-Lauf über Lobby, alle vier Spiele, Risikopanel) fand 26 von 46
  interaktiven Elementen unter der geforderten 44×44-CSS-Px-Mindestgröße — alle behoben
  (0 verbleibend). `tests/reduced-motion.js` fragt den Browser direkt, ob irgendwo eine
  CSS-Animation läuft, statt einer manuellen Selektorliste zu vertrauen; fand 9 bislang
  nicht abgedeckte Animationen (u. a. den tatsächlich aktiven Spin-Busy-Puls, Risiko-
  Kartenflip, sowie vier erst nach einem Gewinn erreichbare: Payline-Zeichnen, Payline-
  Flash, Gewinnsymbol-Puls) — alle jetzt unter `prefers-reduced-motion` deaktiviert, mit
  Sonderbehandlung für die Payline-Linie (die auch im Reduced-Motion-Endzustand sichtbar
  bleiben muss, nicht nur unanimiert). `:focus-visible` war bereits durchgängig über
  generische `button`/`input`-Selektoren abgedeckt, kein Fund nötig.
  **Offen aus Phase 5**: die eher gestalterisch-offenen Punkte (Shark-Abyss-Artwork
  vertiefen, Fruit Reactor/Fancy Harvest/Tomb of Kings Art-Direction verstärken,
  Win-Choreografie-Feintuning) — bewusst zurückgestellt zugunsten von Phase 6
  (Audio-Engine), da dort konkrete, testbare Technik-Anforderungen (Bus-Struktur,
  AudioContext-Lifecycle, Gain-Ramps) offen sind, während die Artwork-Vertiefung ohne
  harte Erfolgskriterien beliebig viel Zeit binden kann.
- **Phase 6 — zentrale Audio-Engine**: Statt jedem Oszillator direkt an
  `ctx.destination` anzuschließen, jetzt ein Master-Bus → Limiter
  (`DynamicsCompressor`, verhindert Clipping bei Big-Win-Tonhäufungen) →
  Ausgabe, mit getrennten UI-/Reel-/Win-/Feature-/Music-Bussen (Music-Bus ohne
  aktuellen Titel, aber verdrahtet). `soundFx()` routet jeden Effekt in seinen
  passenden Bus. Sound-Aus fährt jetzt den Master-Bus auf 0 (statt nur neue Töne
  zu blockieren) — schaltet auch bereits klingende Töne sofort stumm; Sound-An
  stellt ihn zurück. AudioContext wird bei `visibilitychange` sauber
  suspended/resumed. Belegt durch `tests/audio-engine.js` (9/9, echte
  Introspektion des Laufzeit-Audiographen über einen reinen Lese-Debug-Hook,
  keine Behauptung ohne Beleg) plus erneutem `/code-review` (1 echter Fund,
  behoben; 2 als absichtlicher Defensivcode bewertet und belassen).
  **Offen aus Phase 6**: Kopfhörer-/Lautsprecher-Verhalten, echter
  Audio-Fokusverlust (eingehender Anruf) und Lautlosmodus sind auf echter
  iOS-Hardware nicht testbar in dieser Umgebung — dokumentierte Lücke, siehe
  Abschnitt "Verbleibende bekannte Einschränkungen".
- **Release-Gate "500 aufeinanderfolgende Spins" jetzt wörtlich erfüllt**:
  `tests/soak-500.js` spielt 500 Spins **hintereinander auf einem einzigen Spiel**
  (nicht über vier Spiele verteilt wie der frühere `soak.js`) und trackt zusätzlich
  JS-Heap-Größe (Chromiums `performance.memory`) und den Audio-Engine-Zustand.
  Ergebnis: 500/500 abgeschlossen, 0 Hänger, nie negatives Guthaben, DOM-Knoten
  397→389 (kein Wachstum), JS-Heap pendelt 2.5–2.9 MB über den ganzen Lauf (kein
  monotoner Anstieg, alle 100-Spins-Checkpoints in `RELEASE_REPORT.md` protokolliert:
  2,8/2,6/2,9/2,9/2,9 MB), Audio-Graph nach 500 Spins weiterhin intakt (Limiter +
  alle 5 Busse vorhanden, `masterGain=1`), `pendingSpin` am Ende `null`, 0
  Konsolenfehler.
- **WebKit-Testlauf explizit geprüft und bestätigt nicht verfügbar**: In dieser
  Umgebung ist nur der Chromium-Browser vorinstalliert; `webkit.launch()` schlägt mit
  „Executable doesn't exist" fehl, und die Umgebungsrichtlinie untersagt einen
  nachträglichen `playwright install`. Bleibt eine dokumentierte, nicht schließbare
  Lücke (siehe Einschränkung 7) — kein stiller Verzicht, sondern aktiv verifiziert.
- **Phase 2/9 — seeded Test-PRNG (explizite Phase-2-Anforderung) + deterministische
  Testmatrix**: `window.__novaTestHooks.setSeed(n)` ersetzt `cryptoFloat` durch einen
  `mulberry32`-Generator, ausschließlich wenn ein Test ihn aktiviert — echtes Spiel
  bleibt bei `crypto.getRandomValues()`. Damit lassen sich seltene Ereignisse
  (Freispiel-Trigger, Mehrfachlinien-Gewinn, Mystery-Reveal, Expanding Symbol)
  deterministisch reproduzieren statt hunderte Spins lang zu hoffen. Seeds offline
  gegen die exakte, aus `nova-casino.html` extrahierte Mathematik gefunden und gegen
  die echte App verifiziert. `tests/test-matrix.js`: **15/15 bestehen.**
  Dabei ein echter, bis dahin unentdeckter Bug gefunden: Da eine feste Supabase-URL
  konfiguriert ist, zeigte `openProfile()` jedem Gast **ausschließlich** das
  Login-Formular — der vorhandene "Demo zurücksetzen"-Button war nie erreichbar. Ein
  Gast mit aufgebrauchtem Guthaben hatte keinen Weg zurück ins Spiel. Behoben:
  Gastguthaben-Anzeige + funktionierender Reset-Button direkt im Login-Sheet
  (`AUDIT.md` B6).
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
| B7 | Algen-Persistenz verglich mit unsichtbarem Grid-Symbol statt Board-Position | `tests/algae-persistence.js`: 5/5 PASS |

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

### Algen-Persistenz-Test (`tests/algae-persistence.js`, nutzergemeldeter Bug)
5/5 Assertions PASS: Seed 12 sät genau einen Algen-Zustand; über mehrere echte
(nicht geseedete) Spins zählt der getrackte Zustand exakt um 1 pro Spin herunter,
ohne Aussetzer; er übersteht mindestens einen zusätzlichen Spin (widerlegt den alten
Sofort-Verschwinden-Bug); er wird am Ende regulär aufgedeckt statt ewig zu bestehen;
null Konsolenfehler. Anschließend vollständige Regressionssuite (smoke,
settlement-invariant, test-matrix, tomb-of-kings-feature, touch-targets,
reduced-motion, audio-engine, pwa-offline) erneut ausgeführt — alle weiterhin grün,
keine Nebenwirkungen durch den Fix.

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

Vollständige Tabellen, Methodik und Bewertung: `RTP_REPORT.md`. Finale Kalibrierung,
gepoolt über 5 Seeds à 5.000.000 Spins = **25.000.000 Spins je Spiel**:

| Spiel | Ziel-RTP | Gemessen (25 Mio. Spins) | Δ | Innerhalb ±0,15pp? |
|---|---|---|---|---|
| Shark Abyss | 88,43 % | 88,320 % | −0,110pp | Ja |
| Fruit Reactor | 88,63 % | 88,288 % | −0,342pp | Nein |
| Fancy Harvest | 88,22 % | 87,703 % | −0,517pp | Nein |
| Tomb of Kings | 87,25 % | 86,419 % | −0,831pp | Nein |

Bei dieser Stichprobengröße ist der Standardfehler eng genug (±0,08–0,17pp), dass die
Abweichungen bei Fruit Reactor, Fancy Harvest und Tomb of Kings **systematisch**
(nicht zufällig) sind. Ursachen pro Spiel benannt, Spielmathematik dabei **nicht**
verändert (siehe `RTP_REPORT.md` „Bewertung” und „Finale Kalibrierung”).

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
3. **Deployment existiert, aber von dieser Session nicht selbst getestet.** Der
   Push zu GitHub gelang letztlich (siehe Abschnitt 7), und das mit dem Repository
   verbundene Vercel-Projekt hat für PR #1 automatisch einen Preview-Build erzeugt:
   https://new-casino-git-claude-nova-casin-ccc8ca-ricos-projects-9ca86c53.vercel.app
   (Status laut GitHub-Check „Ready"/„Deployment has completed"). Der in Phase 10
   geforderte Kern-E2E-Test gegen die reale URL konnte aus dieser Session heraus
   **nicht** ausgeführt werden: Die Netzwerk-Egress-Richtlinie dieser Umgebung blockiert
   jeden ausgehenden Zugriff auf diese Vercel-Domain — bestätigt über drei unabhängige
   Wege (`curl`, `WebFetch`-Tool, echter Chromium-Browser via Playwright), alle mit
   „egress blocked"/„tunnel connection failed". Der Link ist damit eine verifizierte
   Tatsache (aus dem GitHub-PR-Status), sein tatsächliches Verhalten im Browser wurde
   in dieser Session aber nicht geprüft — das müsste jemand mit Zugriff auf die URL
   von außerhalb dieser Sandbox nachholen.
4. **11 leere `catch{}`-Blöcke unverändert** (AUDIT.md M1) — funktional meist
   vertretbare Best-Effort-Fallbacks, aber ohne Logging, was künftige Fehlersuche
   erschwert.
5. **Kein Max-Win-Cap in der Spielmathematik gefunden** (siehe `RTP_REPORT.md`) — als
   Produktentscheidung markiert, nicht in dieser Session ergänzt.
6. **RTP-Abweichungen bei Fancy Harvest/Tomb of Kings** sind dokumentiert, aber nicht
   "korrigiert" — eine bewusste Entscheidung erfordert, ob die UI-Texte oder die
   Kalibrierungsfaktoren angepasst werden (siehe `RTP_REPORT.md`).
7. **Kein automatisierter WebKit/Safari-Lauf.** Alle Browsertests liefen unter
   Chromium (Playwright). WebKit ist in dieser Umgebung aktiv geprüft **nicht**
   installiert (`webkit.launch()` schlägt mit „Executable doesn't exist" fehl); ein
   nachträgliches `playwright install` widerspricht der Umgebungsrichtlinie. Das ist
   damit eine verifizierte, nicht selbst schließbare Lücke, kein stiller Verzicht —
   ersetzt aber nicht Punkt 1 (echtes iPhone/Safari).
8. **Freundes-Feed-Beträge** unverändert als bestehende Produktentscheidung belassen
   (AUDIT.md M2) — keine neue Konfigurierbarkeit ergänzt, um keine ungefragte
   Verhaltensänderung einzuführen.

## 6. Pfad zur direkt öffnungsfähigen HTML

`nova-casino.html` im Repository-Root. Doppelklick bzw. `file://`-Öffnen genügt für den
vollständigen Gastmodus (siehe README.md „Schnellstart“).

## 7. Deployment

`git push` zum Branch `claude/nova-casino-handoff-4qa406` schlug zunächst mit `403`
fehl ("Claude doesn't have GitHub access to ricobttchr/New-casino for your
organization"); nach Autorisierung durch den Nutzer war der Push erfolgreich. Alle
10 Commits liegen jetzt auf `origin/claude/nova-casino-handoff-4qa406`, und
[Pull Request #1](https://github.com/ricobttchr/New-casino/pull/1) wurde erstellt.

Das mit dem Repository verbundene Vercel-Projekt hat für diesen PR automatisch einen
Preview-Build erzeugt (Deployment-Konfiguration lag außerhalb dieser Session — nicht
von Claude eingerichtet, sondern bereits vorhandene Repo-/Vercel-Verknüpfung):

**Preview:** https://new-casino-git-claude-nova-casin-ccc8ca-ricos-projects-9ca86c53.vercel.app

Laut GitHub-Commit-Status/Check-Run: `Vercel` → `success` ("Deployment has completed"),
`Vercel Preview Comments` → `success`. Der in Phase 10 geforderte Kern-E2E-Test gegen
diese reale URL konnte **nicht** aus dieser Session heraus ausgeführt werden — die
Netzwerk-Egress-Richtlinie dieser Umgebung blockiert jeden Zugriff auf diese
Vercel-Domain (bestätigt über `curl`, das `WebFetch`-Tool und einen echten
Chromium-Browser, alle mit "egress blocked"/"tunnel connection failed"). Der Link
selbst ist damit verifiziert vorhanden, sein Verhalten im Browser aber nicht.

## 8. iPhone-Installationsanleitung (Kurzfassung)

Siehe README.md „iPhone-Installation“ — Standard-Safari-„Zum Home-Bildschirm“-Ablauf,
in dieser Session nicht auf echter Hardware verifiziert (siehe Einschränkung 1).
