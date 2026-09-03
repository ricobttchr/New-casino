# NOVA Casino — Phase 0 Audit

Datum: 03.09.2026
Geprüfte Datei: `nova-casino.html` (V6.4 Pro Polish, 141.280 Bytes, 958 Zeilen)
Referenzdatei: `NOVA-Casino-v6-Premium-Preview-FIXED.html` (V6.1 Premium, lokale Preview)

Methodik: statische Analyse (Node-Skripte gegen den tatsächlichen Code), vollständige
manuelle Lektüre des JavaScript (Zeilen 373–958) und des Head/CSS-Bereichs. Keine
Behauptung wird ohne konkrete Fundstelle aufgestellt. Wo (noch) kein Test gelaufen ist,
steht das explizit dabei statt eines impliziten "funktioniert".

## Zusammenfassung der automatisierten Prüfungen

| Prüfung | Ergebnis |
|---|---|
| JS-Syntax (`new Function()` auf extrahiertem Script-Block) | OK, keine Fehler |
| `id="..."`-Attribute gesamt | 75 |
| Doppelte IDs | keine |
| `$('#id')`-Aufrufstellen gesamt | 72 |
| Davon ohne passendes `id=` im HTML | keine |
| IDs ohne jede JS-Referenz | `previewBanner`, `onlineDot`, `gameBackdrop` (s. Blocker/Medium unten) |
| `catch{}` (leere Catch-Blöcke) | 11 Stellen |
| Externe Netzabhängigkeiten (harte URLs im Code) | genau eine: `https://ucbkmlkxhfghfzgepkbl.supabase.co` |
| `<link rel="manifest">` / Service Worker / `apple-touch-icon` | keine vorhanden |

Diese Zahlen bestätigen die im Handoff-Dokument genannten Werte (75 IDs, 72 Referenzen,
keine Duplikate) durch tatsächliche Skriptausführung, nicht durch Abschreiben der
Behauptung.

---

## BLOCKER

### B1 — Kein spielbarer Gastmodus (Kernaussage des Handoffs bestätigt)
`spin()` wirft sofort einen Fehler, wenn kein Server-Login besteht:
```
nova-casino.html:880  if(!backend.isAuthenticated)throw new Error('Bitte zuerst im Profil anmelden.');
```
Die komplette lokale Persistenzschicht (`LocalCasinoStore`, Zeile 700–715) und alle vier
Mathematik-Module (`window.__gameMath`, `__fruitMath`, `__fancyMath`, `__bookMath`,
Zeilen 376–639) sind bereits reine, browserseitig lauffähige Funktionen ohne
Server-Abhängigkeit — sie werden im Spin-Pfad nur nicht benutzt. Ein Erstbesucher ohne
Account kann keinen einzigen Spin auslösen. Das widerspricht sowohl dem Produktziel
("in fünf Sekunden spielbar") als auch der nicht verhandelbaren Regel eines robusten
Gastmodus.
→ behoben in Phase 1 dieser Session, siehe RELEASE_REPORT.md.

### B2 — Ein abgeschlossener, aber nicht abgerechneter Spin überlebt ein Reload nicht korrekt
Ablauf: Server antwortet (`pendingSpin` wird gesetzt, Guthaben bereits vorab abgezogen,
Zeile 884) → Tab wird **neu geladen** (nicht nur backgrounded), bevor `animateSpin()` /
`applySpinSettlement()` durchlaufen ist.
- `boot()` (Zeile 951) ruft nach Login nur `recoverPendingRequest()` auf. Diese Funktion
  reagiert ausschließlich auf `store.state.pendingRequest` (eine *unbeantwortete* Anfrage),
  nicht auf `store.state.pendingSpin` (eine *beantwortete, aber unpräsentierte* Anfrage).
- `resumePending()`, die einzige Funktion, die `pendingSpin` korrekt fertigstellt, wird nur
  aus dem `visibilitychange`-Listener (Zeile 949) aufgerufen — nicht beim Boot.
- Ergebnis: Nach einem echten Reload in genau diesem Fenster bleibt `pendingSpin`
  unbegrenzt in `localStorage` liegen. Stats/Feature-State für diesen Spin werden nie
  gebucht, obwohl das Guthaben serverseitig (und lokal vorab) bereits verändert wurde.
- Zusätzlich verhindert nichts, dass ein neuer `spin()`-Aufruf einen alten, noch nicht
  abgerechneten `pendingSpin` überschreibt (`spin()`, Zeile 874, prüft nur `spinning` und
  `riskSpinBlocked()`, nicht `store.state.pendingSpin`).
→ Verstößt gegen die Settlement-Invariante ("exakt einmal buchen"). Kritischste
konkrete Instabilität, die im Code selbst nachweisbar ist — der im Handoff nur allgemein
befürchtete iPhone-Bug hat hier eine exakte Ursache. Behoben in Phase 1.

### B4 — "NEHMEN"-Button (Gewinn nehmen) im Kartenrisiko auf iPhone 15 Pro nicht antippbar
Gefunden durch echten End-to-End-Lauf mit Playwright/Chromium auf dem kanonischen
Viewport 393×852 (siehe `tests/smoke.js`), nicht durch Code-Lektüre. In der
Drei-Spalten-Aktionsleiste des Kartenrisikos (`#riskCardActions`, Zeile 343: ROT /
NEHMEN / SCHWARZ) sitzt die rein dekorative Kartenvisualisierung `#riskCard`
(`position:absolute`, `z-index:2`, kein Klick-Handler in der gesamten App) laut Messung
über etwa 33 der 43px Höhe des mittleren `#riskCollect`-Buttons — der Button-Text
"NEHMEN" ist im Screenshot vollständig verdeckt und `page.click('#riskCollect')`
schlägt fehl, weil `#riskCard` die Pointer-Events abfängt. Ein echter Spieler kann den
Gewinn im Kartenrisiko auf diesem Layout nicht zuverlässig nehmen — eine
Kernspielfunktion war unerreichbar.
→ Ursache: `#riskCard` ist reines Statusdisplay ohne jede Interaktionslogik; Fix ist
`pointer-events:none` auf `.risk-card` (eine Zeile, keine Layoutänderung, keine
Auswirkung auf die Optik) — Taps erreichen jetzt den darunterliegenden Button. Mit
demselben Playwright-Lauf nach dem Fix verifiziert.

### B3 — Kein Watchdog/keine Deadline in `animateSpin()`
`animateSpin()` (Zeile 827) ist eine reine `await sleep(ms)`-Kette ohne harte
Maximaldauer und ohne `AbortController`. Bleibt der Tab während der Animation
eingefroren (iOS-Hintergrund-Drosselung / `freeze`-Lifecycle) und wird die Seite dabei
verworfen statt nur pausiert, bleibt `spinning=true` (In-Memory, nicht persistiert) und
die zuletzt gesetzten CSS-Klassen (`in-motion`, `blur`, `machine-running`) hängen
dauerhaft im DOM, sobald der Tab wieder aktiv wird — exakt das historische
iPhone-Symptom aus dem Handoff. Es existiert keine zentrale `forceCompleteSpin()`-Routine.
→ Watchdog + `forceCompleteSpin()` in Phase 1 ergänzt.

---

## HIGH

### H1 — Versionsinkonsistenz
- UI-Banner: `V6.4 PRO POLISH · SERVER-MODUS` (Zeile 210)
- Code: `const BUILD_VERSION='6.3.0';` (Zeile 484)
- Storage-Keys: `nova-v63-device-id`, `nova-v63-auth` (Zeile 485–486)
- Info-Sheet nennt zusätzlich pauschal "1 Mio. Spins geprüft" (Zeile 946) für **alle**
  vier Spiele, ohne dass ein mitgelieferter Report das belegt.
- Zusätzlich gefunden durch einen echten Lighthouse-Accessibility-Lauf (nicht durch
  Code-Lektüre): Der Marken-Header zeigte fest verdrahtet "CASINO · BETA 6.3" — eine
  dritte, bis dahin unentdeckte Versionsangabe neben UI-Banner und `BUILD_VERSION`.
→ `BUILD_VERSION` auf `6.4.0` angehoben, Storage-Keys auf `nova-v64-*` migriert (mit
Fallback-Lesepfad für v63, analog zum bereits vorhandenen v1→v2-Migrationsmuster,
Zeile 707–709). Der pauschale "1 Mio. Spins"-Text bleibt vorerst unverändert (Produktentscheidung,
siehe P1 unten) — die tatsächlich gefahrenen Stichprobengrößen stehen in `RTP_REPORT.md`.

### H2 — Dev-Banner permanent sichtbar
`<div id="previewBanner">…V6.4 PRO POLISH · SERVER-MODUS</div>` (Zeile 210) ist fest im
Markup, ohne Ausblendlogik. Für den Premium-Ersteindruck (Produktziel: 5 Sekunden bis
"fertige App") ungeeignet, da es wie ein Entwickler-Overlay wirkt.
→ Empfehlung: entweder entfernen oder nur bei `?debug=1` einblenden. In dieser Session
entfernt (Polish, geringes Risiko, siehe RELEASE_REPORT.md).

### H3 — Presence-Punkt zeigt immer "online"
`<i id="onlineDot"></i>` (Zeile 223) wird nirgends per JS gesetzt; er ist ausschließlich
über den generischen Selektor `.avatar-button i` (Zeile 34) grün eingefärbt — unabhängig
vom tatsächlichen Auth-/Verbindungsstatus. Das ist irreführend (impliziert eine Live-
Verbindung, die im Gastmodus/offline nicht besteht) und grenzt an ein Transparenz-Problem,
das die Produktregeln explizit vermeiden wollen (keine vorgetäuschten Live-Zustände).
→ In Phase 1 an den bestehenden `connectionBadge`-Status gekoppelt.

### H4b — Barrierefreiheit: Zoom deaktiviert, fehlende Meta-Description, Name/Label-Mismatch
Gefunden durch einen echten Lighthouse-Lauf gegen den lokalen HTTP-Server (Kategorie
Accessibility: 93/100, Best Practices/Performance: 100/100, SEO: 90/100 vor dem Fix):
`user-scalable=no` im Viewport-Meta verhindert Pinch-Zoom für sehbehinderte Nutzer,
`#brandButton` hatte ein `aria-label`, das den sichtbaren Text "NOVA CASINO" nicht
enthielt (Screenreader-Name und sichtbarer Text widersprachen sich), und es fehlte eine
`<meta name="description">`. Alle drei in dieser Session behoben (Zoom erlaubt,
Label um sichtbaren Text ergänzt, Description hinzugefügt) — nach dem Fix erneut mit
Lighthouse verifiziert (siehe RELEASE_REPORT.md für die Vorher/Nachher-Scores).

### H4 — `navigator.vibrate()` ohne Realitäts-Disclaimer
Haptik wird durchgängig aufgerufen (`haptic()`, Zeile 793 ff.) ohne jede Kennzeichnung,
dass iOS Safari `navigator.vibrate()` nicht unterstützt. Für sich harmlos (der Aufruf ist
in `try/catch` gekapselt und scheitert still), aber die Produktregel verlangt, Haptik
niemals als garantiert darzustellen — das UI verspricht aktuell nirgends etwas Falsches,
aber auch keine ehrliche Einordnung existiert. Dokumentiert in README.md.

---

## MEDIUM

### M1 — 11 leere Catch-Blöcke (`catch{}`)
Fundstellen u. a. Zeile 491 (`localStorage`-Schreibzugriff), 494/495 (Session
speichern/laden), 512 (`startPresence/updatePresence/broadcastActivity/stopPresence`),
513 (`logError` selbst schluckt Fehler), 712/714 (`LocalCasinoStore.save/reset`),
789/790/791 (Audio-Erzeugung), 793 (Haptik). Die meisten sind bewusste
Best-Effort-Fallbacks (z. B. Audio auf Browsern ohne `AudioContext`, Vibration auf iOS)
und funktional vertretbar — aber ausnahmslos ohne Logging, was künftige Fehlersuche
erschwert. Keine Änderung an der Fehlerbehandlung selbst vorgenommen (Verhalten bewusst
beibehalten, um keine neue Fehlerquelle einzuführen), aber als bekannte Einschränkung in
README.md vermerkt.

### M2 — Freundes-Aktivitätsfeed zeigt Beträge (Produktentscheidung, nicht stillschweigend geändert)
`renderLiveFeed()` (Zeile 906) zeigt `+${moneyCents(a.amount_cents||0)}` je Freundes-Gewinn.
Dies ist bestehendes Verhalten und wurde **nicht** verändert. Es steht im Spannungsfeld zu
einer früher diskutierten Spezifikation, die nur Presence ohne Beträge vorsah. Als
Produktentscheidung dokumentiert: Beträge bleiben sichtbar, sind aber ausschließlich
Simulationswerte ohne Geldwert (siehe Profil-Sheet, Zeile 922). Empfehlung für eine
spätere, bewusste Entscheidung: über ein Store-Flag (`store.state.showFriendAmounts`)
konfigurierbar machen, statt es hart zu verdrahten — in dieser Session nicht umgesetzt,
um keine ungefragte Verhaltensänderung einzuführen.

### M3 — Pauschale RTP-/Testbehauptung im Info-Sheet
Zeile 946: `<strong>1 Mio. Spins geprüft</strong>` für jedes der vier Spiele, unabhängig
vom tatsächlichen Spiel. Bis zu dieser Session war das nicht durch einen mitgelieferten
Report belegt. `RTP_REPORT.md` in dieser Session enthält die real gefahrenen
Stichprobengrößen und Seeds je Spiel; wo die tatsächliche Stichprobe von "1 Mio." abweicht,
ist das dort transparent ausgewiesen.

### M4 — Kein Recovery-Pfad für offene Gamble-Runden beim Reload
`resumeGambleAction()` wird — wie `resumePending()` — nur bei `visibilitychange`
aufgerufen (Zeile 949), nicht in `boot()`. Ein Reload mit aktivem `pendingGamble`
zeigt zwar über `renderRisk()` weiterhin die Risikoleiter korrekt an (der State ist ja
persistiert), aber ein zuvor gestartetes `pendingGambleAction` (bereits an den Server
geschickt, Antwort ausstehend) wird beim reinen Boot nicht erneut angestoßen.
→ In Phase 1 mitkorrigiert (gleiche Ursache wie B2).

---

### H5 — `icon-512.PNG` ist ein generisches Stock-Icon mit Echtgeld-Bildsprache
Das im Projektordner mitgelieferte `icon-512.PNG` zeigt ein Roulette-Rad, Pokerchips und
Goldmünzen mit **Dollar-Symbolen**. Das widerspricht direkt der nicht verhandelbaren
Produktregel "keine ... Verbindung zu Echtgeldcasinos" und "keine Werbung für
Glücksspiel" — ausgerechnet das App-Icon (der erste Eindruck, noch vor dem Öffnen der
App) hätte reale Geldsymbole gezeigt. Zusätzlich passt das Motiv zu keinem der vier
tatsächlichen NOVA-Spiele (kein Roulette im Produkt) und ist kein NOVA-Eigenwerk.
→ Nicht als Produktions-Icon verwendet. Stattdessen wurde ein eigenständiges Icon-Set
aus dem bereits vorhandenen NOVA-Artwork erzeugt (dieselbe Hai-SVG aus
`js/symbol-art.js`, dieselbe Lila-Verlaufsfarbe wie `.brand-mark`/`.hero-card`) — siehe
Ordner `icons/`, referenziert von `manifest.webmanifest`. Das Original bleibt
unverändert im Repository-Root liegen (nicht gelöscht), wird aber von
`manifest.webmanifest` nicht referenziert.

## POLISH

- `gameBackdrop`-ID (Zeile 303) wird nur über die Klasse `.underwater-bg` gestylt, nie per
  JS oder ID-Selektor angesprochen — die ID selbst ist überflüssig. Keine funktionale
  Auswirkung, nicht verändert.
- Inline-`style`-Attribut für `previewBanner` statt CSS-Klasse — nur relevant, falls das
  Banner erhalten bleiben soll.
- `LINE_CALIBRATION`, `FRUIT_CALIBRATION`, `BOOK_CAL` sind hart codierte, unkommentierte
  Kalibrierungsfaktoren (0.997 / 0.54928 / 0.696). Sie sind zentral in den Mathematik-
  Modulen platziert und über Monte-Carlo-Simulation in dieser Session nachvollzogen
  (siehe `RTP_REPORT.md`); für zukünftige Anpassungen wäre ein Kommentar mit der
  Herleitung hilfreich.

---

## Nachtrag (Phase 4 — Reel-Motion-Umbau)

### B5 — Landscape 852×393: Walzenraster vollständig abgeschnitten
Gefunden durch einen echten Playwright-Screenshot im Pflicht-Testviewport
Landscape 852×393 (Phase 7). Die einzige vorhandene Verkleinerungsregel
(`@media (max-height:720px)`, Zeile 63) reicht bei einer Viewport-Höhe von nur 393px
bei weitem nicht aus: Kopf- und Fußbereich allein beanspruchten mehr als die
verfügbare Höhe, das Walzenraster wurde oben und unten abgeschnitten (nur ein Teil
der vier bzw. drei Reihen sichtbar), das Spiel war in diesem Viewport faktisch
unbrauchbar. Kein horizontales Scrollen trat auf (das wurde separat geprüft und war
schon vorher in Ordnung), nur vertikales Abschneiden.
→ Neue `@media (max-height:460px)`-Regel ergänzt, die Logo, Walzenrahmen (jetzt über
`height` statt `width` bemessen, damit die Höhe die knappe Ressource korrekt
steuert), Feature-Leiste und Bedienfeld gezielt verkleinert. Mit Screenshots für
Shark Abyss (4 Reihen) und Fruit Reactor (3 Reihen) verifiziert: beide vollständig
sichtbar, kein Abschneiden mehr, Spin bleibt funktionsfähig.

## Nachtrag (Phase 2/9 — seeded Test-PRNG und deterministische Testmatrix)

### B6 — "Demo zurücksetzen" für Gäste unerreichbar (echter Bug, kein Testartefakt)
Gefunden beim Aufbau der deterministischen Testmatrix für den Testfall "kostenloses
Auffüllen im Gastmodus". `openProfile()` prüft `if(backend.isRemote&&!backend.isAuthenticated)`
und zeigt in diesem Fall **ausschließlich** das Login/Registrierungs-Formular — niemals
das normale Profil-Sheet mit dem weiter unten im selben Code vorhandenen
"Demo zurücksetzen"-Button. Da `nova-casino.html` eine feste Supabase-URL referenziert
(`backend.isRemote` ist damit immer `true`), trifft diese Bedingung auf **jeden** Gast
zu — der Reset-Button war folglich in keiner erreichbaren UI-Fassung jemals nutzbar,
obwohl der Code dafür existierte. Ein Gast, dessen lokales Guthaben auf 0 fällt, hatte
keinen Weg zurück ins Spiel außer manuellem Löschen des Browser-Speichers.
→ Login-Sheet um Gastguthaben-Anzeige und einen funktionierenden
"Gast-Demo zurücksetzen"-Button ergänzt. Mit `tests/test-matrix.js` verifiziert (Button
tatsächlich klickbar, Guthaben wird auf 100,00 € zurückgesetzt).

### Umsetzung: seeded Test-PRNG (explizite Phase-2-Anforderung)
`window.__novaTestHooks.setSeed(n)`/`clearSeed()` ersetzt `cryptoFloat` durch einen
`mulberry32`-Generator ausschließlich für `generateLocalSpin()`/`resolveLocalGamble()`,
und nur solange ein Test ihn aktiv gesetzt hat — echtes Spiel bleibt unverändert bei
`crypto.getRandomValues()`. Seeds für konkrete Ergebnisse (Freispiel-Trigger,
Mehrfachlinien-Gewinn, Mystery-Reveal, Expanding-Symbol-Freispiel) wurden offline gegen
exakt dieselbe aus `nova-casino.html` extrahierte Mathematik gesucht
(`scratchpad/find_seeds.js`) und gegen die echte laufende App verifiziert — nicht nur
gegen den Offline-Simulator. `tests/test-matrix.js`: 15/15 deterministische Prüfungen
bestehen (Bonusstart/Freispiele auf Shark Abyss und Tomb of Kings, Mehrfachlinien-Gewinn,
Mystery/Algen, Expanding-Symbol-Freispiel, Fruit-Reactor-Gewinn/-Verlust/Kartenrisiko/
Gewinn-nehmen, unzureichendes Guthaben, Fancy-Harvest-Leiterrisiko, Gastmodus-Reset).

## Nicht abschließend geprüft (ehrliche Lücken dieser Session)

- **Kein Zugriff auf das Supabase-Projekt** (`ucbkmlkxhfghfzgepkbl.supabase.co`): Ob die
  clientseitig erwarteten RPCs (`client_sync_snapshot`, `find_profile_by_friend_code`,
  `accept_friendship`, `release_player_device`, `log_client_error`) sowie die Edge
  Functions `/functions/v1/spin` und `/functions/v1/gamble` serverseitig existieren, RLS
  korrekt greift und die Antwortformate zu `normalizeRemoteSpin()` passen, konnte in
  dieser Umgebung **nicht verifiziert** werden — es gibt weder Migrations- noch
  Functions-Ordner im Repository. Dies bleibt ein dokumentierter Blocker für den
  Online-Modus (siehe RELEASE_REPORT.md).
- **Kein echtes iPhone verfügbar.** Alle Aussagen zu iOS-Verhalten in diesem Dokument
  sind Code-Analyse (Timer-/Lifecycle-Semantik), keine Messung auf echter Hardware.
- Kein Lighthouse-/Accessibility-Audit-Tool mit Netzwerkzugriff auf eine deployte URL
  in dieser Session ausgeführt (kein Deployment vorhanden, siehe RELEASE_REPORT.md).
