# NOVA Casino — aktueller Stand und Masterprompt für Claude Code

Stand: 03.09.2026

## 1. Welche Datei ist die richtige Grundlage?

Die kanonische und am weitesten entwickelte Fassung ist:

- `nova-casino.html` — intern als **V6.4 Pro Polish** bezeichnet

Als technische Referenz für einen stabilen lokalen/offline Spielmodus dient:

- `NOVA-Casino-v6-Premium-Preview-FIXED.html` — lokale Premium-Preview

Die V6.4 bleibt die visuelle und funktionale Hauptquelle. Die ältere lokale Preview darf nur gezielt als Referenz für einen belastbaren Gastmodus verwendet werden. Nicht pauschal zurückportieren und nicht die V6.4 durch die ältere Datei ersetzen.

## 2. Tatsächlicher aktueller Entwicklungsstand

### Vorhanden

- Mobile-first Single-File-App aus HTML, CSS und Vanilla JavaScript.
- Vier spielbare bzw. mathematisch implementierte Slots:
  - **Shark Abyss:** 5 × 4, 20 Linien, Freispiele, Mystery/Algen, Multiplikator.
  - **Fruit Reactor:** 5 × 3, 5 Linien, Kartenrisiko.
  - **Fancy Harvest:** 5 × 3, 5 Linien, Karten- und Leiterrisiko.
  - **Tomb of Kings:** 5 × 3, 10 Linien, Freispiele, Expanding Symbol und Retrigger.
- Eigenes Inline-SVG-Artwork für Spielsymbole und UI-Elemente.
- Besonders ausgearbeitete Shark-Welt mit animiertem Hai, Luftblasen, Unterwasserlicht, Glas-/Nässeeffekt und Algen-Reveal.
- Persistenter Algenzustand über `algaeStates` und `algaePresentation`.
- Unterschiedliche Gewinninszenierungen einschließlich Count-up, Partikeln, Haptikversuchen und Reel-Shake.
- Web-Audio-basierte, prozedurale Soundeffekte.
- Lokale Speicherung mit Wiederherstellungszuständen:
  - `pendingRequest`
  - `pendingSpin`
  - `pendingGambleAction`
- Supabase-Anbindung im Frontend:
  - E-Mail/Passwort-Accounts
  - Wallet-/Statistik-Synchronisierung
  - Freundescodes und Freundschaftsanfragen
  - Presence/Online-Status
  - Freundes-Aktivitätsfeed
  - serverseitig vorgesehene Spin- und Gamble-Endpunkte
  - Idempotency Keys und Wiederaufnahme begonnener Requests
- Sichtbare simulierte RTP-Angaben im aktuellen Code:
  - Shark Abyss: **88,43 %**
  - Fruit Reactor: **88,63 %**
  - Fancy Harvest: **88,22 %**
  - Tomb of Kings: **87,25 %**

### Bereits technisch geprüft

- Dateigröße: etwa 141 KB.
- 959 Codezeilen in der aktuellen kompakten Fassung.
- JavaScript-Syntaxprüfung erfolgreich.
- 75 statische HTML-IDs, keine doppelten IDs.
- 72 statisch erkennbare `$('#id')`-Referenzen; keine davon verweist auf eine fehlende ID.

Diese Prüfungen beweisen Syntax- und Strukturkonsistenz, aber noch keine vollständige Laufzeit-, Backend-, Safari- oder RTP-Verifikation.

### Bekannte Lücken und Risiken

1. **V6.4 ist derzeit kein verlässlicher Standalone-Build.** Ein Spin verlangt einen angemeldeten Remote-Account. Der lokale Store existiert, ist aber nicht als vollständiger lokaler Spielpfad verdrahtet.
2. **Der Backend-Quellcode ist in der HTML-Datei nicht enthalten.** Das Frontend erwartet unter anderem Supabase RPCs sowie `/functions/v1/spin` und `/functions/v1/gamble`. Migrationen, RLS-Regeln und Edge Functions müssen im Projekt gefunden oder sauber rekonstruiert werden.
3. **Die App ist noch keine vollständige PWA.** Meta-Tags und Safe Areas sind vorhanden, aber ein verifiziertes Manifest, Service Worker, vollständige Icon-Sätze und ein Offline-Cache sind in der aktuellen HTML nicht enthalten.
4. **Versionsbezeichnungen sind inkonsistent.** Das UI nennt V6.4, während `BUILD_VERSION` und Auth-Storage noch auf 6.3 verweisen.
5. **Der historische iPhone-Fehler muss als kritisch behandelt werden:** Walzen konnten dauerhaft unscharf bzw. in Bewegung bleiben; nach Hintergrund/Foreground-Wechsel erschien plötzlich das bereits akustisch beendete Ergebnis. Der aktuelle Code enthält Recovery-Hooks, ist aber auf einem echten iPhone noch nicht ausreichend nachgewiesen.
6. **Die Animation arbeitet überwiegend mit `sleep()` und Timern.** Safari pausiert oder drosselt Timer im Hintergrund. Settlement und Darstellung brauchen deshalb eine explizite, idempotente Zustandsmaschine mit harten Deadlines.
7. **Audio ist funktional, aber noch kein Studio-Sounddesign.** Oszillator-Töne können synthetisch, hart oder abgehackt wirken. iOS-AudioContext, Unterbrechungen und Wiederaufnahme müssen systematisch behandelt werden.
8. **`navigator.vibrate()` funktioniert auf iOS Safari nicht zuverlässig bzw. grundsätzlich nicht wie auf Android.** Haptik darf daher niemals als garantiert dargestellt werden.
9. **Es gibt keinen mitgelieferten automatisierten Testkatalog.** Die im UI genannten Million-Spin-Prüfungen müssen reproduzierbar neu erzeugt und dokumentiert werden.
10. **Kein aktuell erreichbares Deployment und kein zugängliches GitHub-Repository wurden gefunden.** Claude Code muss deshalb den lokalen Ordner als Wahrheit behandeln und eine neue saubere Versionshistorie bzw. Veröffentlichung vorbereiten.
11. **Einige frühere Produktanforderungen widersprechen sich.** Der aktuelle Code zeigt Beträge im Freundes-Aktivitätsfeed, während eine frühere Spezifikation lediglich Presence ohne Beträge vorsah. Das bestehende Verhalten nicht stillschweigend ändern; im Audit als Produktentscheidung markieren.
12. **Fehlende oder nicht vollständig belegte Bereiche:** ausführliche Paytables, Spin-History mit technischen Details, Simulation Lab und echte Installations-/Offline-Prüfung. Vor einer Erweiterung zuerst feststellen, was im Projektordner eventuell zusätzlich vorhanden ist.

---

# 3. MASTERPROMPT FÜR CLAUDE CODE

Kopiere den folgenden Prompt vollständig in Claude Code. Lege vorher mindestens `nova-casino.html` und möglichst auch `NOVA-Casino-v6-Premium-Preview-FIXED.html` in denselben Projektordner.

```text
Du bist der verantwortliche Principal Game Engineer, Senior Mobile-Web-Engineer, Technical Artist, Motion Designer, Audio Designer, QA Lead und Security Reviewer für NOVA Casino.

Dein Auftrag ist nicht, einen neuen Prototyp zu entwerfen. Du übernimmst eine bereits weit entwickelte Social-Casino-App und führst sie kontrolliert zu einem stabilen, veröffentlichungsfähigen Premiumprodukt. Das Produkt ist ausschließlich ein kostenloser Simulator mit virtuellen Punkten ohne Geldwert. Es darf keine Einzahlung, Auszahlung, Kaufmöglichkeit, Echtgeldwette, Werbung für Glücksspiel oder Verbindung zu Echtgeldcasinos geben.

WICHTIGES ARBEITSPRINZIP

- Untersuche zuerst den gesamten Projektordner und den echten Code.
- Behandle `nova-casino.html` als kanonische Hauptfassung und visuelle Wahrheit.
- Verwende `NOVA-Casino-v6-Premium-Preview-FIXED.html` nur als Referenz für einen robusten lokalen Gastmodus.
- Schreibe nicht sofort alles neu.
- Sichere den Ausgangszustand in Git, sofern ein Repository vorhanden oder initialisierbar ist.
- Erstelle zuerst einen kurzen, evidenzbasierten Audit mit konkreten Fundstellen.
- Implementiere anschließend selbstständig nach Priorität.
- Stoppe nicht nach einer hübschen Oberfläche. Die Abnahme verlangt belastbare Funktion, Messwerte und Tests.
- Ändere keine Spielmathematik aus ästhetischen Gründen.
- Behaupte keinen Test, den du nicht tatsächlich ausgeführt hast.
- Kopiere keine geschützten Grafiken, Namen, Sounds, Reel-Strips oder Quellcodes kommerzieller Slots. Die Spiele müssen eigenständig bleiben. Referenzen dienen nur als Qualitäts- und Genrevergleich.

PRODUKTZIEL

Eine Person soll NOVA auf einem iPhone 15 Pro öffnen und innerhalb von fünf Sekunden den Eindruck einer fertigen Premium-App erhalten. Gleichzeitig muss jeder Spin mathematisch unabhängig, technisch sicher abschließbar und nach App-Unterbrechungen exakt einmal abrechenbar sein.

Prioritäten in dieser Reihenfolge:

1. korrekte und niemals hängenbleibende Spin-/Settlement-Logik
2. sichere, reproduzierbar getestete Mathematik
3. funktionierender Gastmodus und funktionierender Online-Modus
4. iPhone-15-Pro-Performance und Lifecycle-Stabilität
5. hochwertige Reel-Bewegung, Reveal-Choreografie und Symbolklarheit
6. eigenständiges Premium-Artwork und konsistente UI
7. professionelles, störungsfestes Audio
8. PWA, Offlinefähigkeit und Deployment
9. Accessibility, Datenschutz und Social-Casino-Transparenz

NICHT VERHANDELBARE PRODUKTREGELN

- Alle Einsätze und Guthaben sind reine Simulationswerte ohne Geldwert.
- Keine Käufe, keine Auszahlungen, keine Echtgeldverknüpfungen.
- Kein RTP-Nachregeln pro Spieler und keine ergebnisgesteuerten Verlust-/Gewinnserien.
- Keine manipulierten Near Misses, Verlustjagd, künstliche „jetzt bist du dran“-Logik oder Dark Patterns.
- Turbo oder reduzierte Bewegung dürfen nur Präsentationsdauer ändern, niemals das Ergebnis.
- Das Ergebnis muss vor seiner Präsentation sicher erzeugt und gespeichert sein.
- Settlement muss idempotent und exakt einmal erfolgen.
- Bestehende Namen und das eigene NOVA-Artwork beibehalten, sofern der Audit keinen konkreten Qualitäts- oder Rechtsgrund dagegen findet.
- Aktuelle mathematische Zielwerte nicht stillschweigend verändern:
  - Shark Abyss 88,43 %
  - Fruit Reactor 88,63 %
  - Fancy Harvest 88,22 %
  - Tomb of Kings 87,25 %
- Wenn eine neue Simulation die Werte widerlegt, dokumentiere vorher/nachher, lokalisiere den Fehler und nimm nur eine nachvollziehbare Korrektur vor.

PHASE 0 — INVENTAR, BASELINE UND RISIKOAUDIT

1. Liste alle Dateien, vorhandenen Backends, Supabase-Migrationen, Functions, Deploy-Konfigurationen und Tests auf.
2. Prüfe `nova-casino.html` vollständig:
   - Syntax
   - doppelte IDs
   - fehlende DOM-Referenzen
   - nicht definierte Funktionen/Variablen
   - tote Buttons
   - leere Catch-Blöcke
   - Versionsinkonsistenzen
   - externe Netzabhängigkeiten
   - PWA-Status
3. Ermittle, ob das referenzierte Supabase-Projekt, die benötigten RPCs und Edge Functions erreichbar und vollständig sind. Niemals einen Service-Role-Key in den Client schreiben.
4. Prüfe die Zustands- und Geldflüsse für Paid Spin, Free Spin, Gamble, Abbruch, Reload, Netzwerkfehler und doppelten Request.
5. Erzeuge `AUDIT.md` mit Findings nach Kritikalität: Blocker, High, Medium, Polish.
6. Erstelle danach einen konkreten Umsetzungsplan und arbeite ihn vollständig ab.

PHASE 1 — UNZERSTÖRBARE SPIN-ZUSTANDSMASCHINE

Ersetze implizite Boolean-/Timer-Kopplung durch eine explizite State Machine, mindestens:

IDLE → REQUESTING → RESULT_READY → SPINNING → STOPPING → REVEALING → SETTLING → CELEBRATING → IDLE

Zusätzliche kontrollierte Zustände:

- PAUSED_HIDDEN
- RECOVERING
- ERROR_RECOVERABLE

Anforderungen:

- Ergebnis vor Start der Ergebnisanimation erzeugen und persistent ablegen.
- Jeder Spin erhält eine eindeutige ID/Idempotency-ID.
- Geld und Statistiken exakt einmal buchen.
- Jeder visuelle Zustand besitzt eine harte Maximaldauer.
- Niemals ausschließlich auf `transitionend`, `animationend`, `setTimeout` oder aktive `requestAnimationFrame`-Schleifen vertrauen.
- Implementiere `withDeadline()`/Watchdog und eine zentrale `forceCompleteSpin()`-Routine.
- `forceCompleteSpin()` muss alle Blur-/Motion-Klassen entfernen, das finale Grid zeichnen, Reveal-Zustände konsistent abschließen, Settlement genau einmal durchführen und Buttons freigeben.
- Bei `visibilitychange`, `pagehide`, `pageshow`, `freeze` und `resume` sinnvoll reagieren:
  - beim Verlassen Ergebnis und Phase sichern;
  - keine unkontrolliert weiterlaufenden Sounds/Timer;
  - beim Zurückkehren entweder sauber fortsetzen oder sofort auf den finalen Zustand springen;
  - niemals eine dauerhaft unscharfe Walze hinterlassen.
- Verwende `AbortController` und Timeouts für Remote Requests.
- Ein verspätetes Serverergebnis darf keinen neueren Spin überschreiben.
- Doppeltippen, Touch-Replay und schnelles App-Wechseln müssen sicher sein.
- Jede Cleanup-Strecke gehört in eine garantierte Abschlussroutine.

Schreibe automatisierte Tests für:

- 500 aufeinanderfolgende Spins ohne hängenden Zustand
- Doppelklick auf Spin
- Hintergrundwechsel in jeder einzelnen Phase
- Reload während Request, Animation, Reveal, Settlement und Big Win
- langsames Netz, Offlinewechsel, HTTP 401/409/429/500 und Timeout
- doppelte Serverantwort und wiederholte Idempotency-ID
- Accountwechsel mit offenem Spin

PHASE 2 — GASTMODUS UND ONLINE-MODUS

Die App muss zwei ehrliche, klar getrennte Betriebsarten besitzen:

1. **Gastmodus:** sofort spielbar, lokal gespeichert, `crypto.getRandomValues()` für normale Spins, keine erfundenen Freunde oder Fake-Live-Events.
2. **Accountmodus:** serverautoritative Spins, synchronisierte Wallet/Statistiken, Freunde und Presence.

Gastmodus darf nicht von Supabase abhängen. Der lokale mathematische Pfad muss dieselben Regeln und Paytables verwenden wie der Serverpfad. Implementiere zusätzlich einen ausschließlich für Tests verwendeten seeded PRNG.

Für den Accountmodus:

- Prüfe oder erstelle versionierte Supabase-Migrationen.
- Aktiviere und teste RLS für jedes relevante Objekt.
- Client darf niemals Guthaben, Gewinn oder Spinresultat autoritativ setzen.
- `/spin` und `/gamble` müssen serverseitig validieren, RNG ausführen, Ergebnis buchen und idempotent antworten.
- Implementiere atomare Transaktionen bzw. entsprechend sichere Datenbankfunktionen.
- Prüfe Replay-Schutz, Rate Limits, Gerätebindung, Session Refresh, E-Mail-Verifikation und Fehlercodes.
- Presence darf bei App-Hintergrund zuverlässig veralten.
- Keine privaten E-Mail-Adressen im Freunde-/Aktivitätsfeed.
- Entscheide nicht eigenmächtig, ob Freundesgewinnbeträge gezeigt werden. Dokumentiere das bestehende Verhalten als Produktentscheidung und kapsle es konfigurierbar.
- Wenn Remote nicht erreichbar ist, kommuniziere klar „Server nicht erreichbar“. Keine stillschweigende Vermischung lokaler und serverseitiger Wallets.

PHASE 3 — SPIELMATHEMATIK UND TRANSPARENZ

Behandle die vorhandenen Paytables, Symbolgewichte, Paylines, Feature-Regeln und Kalibrierungsfaktoren als Ausgangswahrheit. Extrahiere die Mathematik so, dass Browser, Server und Test-Simulator dieselbe kanonische Konfiguration verwenden oder automatisch auf Gleichheit geprüft werden können.

Für jedes Spiel testen und dokumentieren:

- RTP
- Hit Frequency
- Bonus-/Free-Spin-Frequenz
- durchschnittlicher Bonusgewinn
- Standardabweichung
- maximal beobachteter Gewinn
- theoretisches Max Win
- Verteilung der Gewinnmultiplikatoren

Führe reproduzierbare Monte-Carlo-Läufe mit mindestens 10.000, 100.000, 1.000.000 und für die finale Kalibrierung 5.000.000 Spins pro Spiel aus. Verwende mehrere feste Seeds. Ziel ist bei großer Stichprobe eine plausible Konvergenz innerhalb ungefähr ±0,15 Prozentpunkten des ausgewiesenen RTP, sofern Varianz und Stichprobengröße dies belastbar zulassen. Berichte Konfidenz/Standardfehler, statt kleine Stichproben überzuinterpretieren.

Prüfe insbesondere:

- Gesamteinsatz versus Linienbet
- Rundung auf Cents
- Free-Spin-Wins und Multiplikatoren
- Retrigger
- Mystery/Algen
- Expanding Symbol
- Karten- und Leiterrisiko
- Max-Win-Cap
- Gleichheit lokaler und serverseitiger Auswertung

Erzeuge `RTP_REPORT.md` mit Seeds, Spinzahl, Ergebnissen und Abweichungen. Keine bloßen UI-Texte als Beleg akzeptieren.

PHASE 4 — REELS UND MOTION AUF KOMMERZIELLEM NIVEAU

Verbessere die Präsentation, ohne die Mathematik zu verändern:

- Reelbewegung muss wie echte rotierende Strips wirken, nicht wie wechselnde Zufallskacheln.
- Verwende pro Walze einen visuellen Strip/Ringbuffer mit Overscan.
- Phasen: Anziehen, konstante Geschwindigkeit, Bremsen, kontrollierter Overshoot, kurzer Settle.
- Walzen stoppen nacheinander mit klarer akustischer Synchronität.
- Blur nur während hoher Geschwindigkeit; beim Bremsen kontinuierlich reduzieren; nach Stopp garantiert 0.
- Keine kostspieligen Layout-Messungen pro Frame.
- Nur `transform` und `opacity` im heißen Animationspfad.
- Keine dauerhaft großen `filter: blur()`-Flächen auf iOS.
- Animationen delta-time-basiert oder über Web Animations API mit verlässlichem Fallback steuern.
- Finales Symbolraster muss pixelgenau mit dem mathematischen Ergebnis übereinstimmen.
- Anticipation nur bei einem bereits erzeugten, passenden Ergebnis anzeigen. Keine falschen Near Misses erzeugen.
- Paylines müssen der echten Konfiguration entsprechen und Gewinnzellen verständlich markieren.

Shark-Reveal:

- Die vorhandene spinübergreifende Algenstruktur erhalten und formal testen.
- Neue Alge kann mit 2–5 Restspins erscheinen.
- Countdown pro gültiger Zelle sauber reduzieren.
- Wenn das zugrunde liegende Symbol/Zellereignis nicht mehr gültig ist, Zustand sauber verwerfen.
- Bei 0 kontrolliert erodieren, finales Symbol aufdecken und exakt mit dem bereits erzeugten Ergebnis übereinstimmen.
- Tick, Erosion, Reveal, Gewinnlinie und Multiplikator in einer nachvollziehbaren Choreografie ausführen.
- Skip/Reduced-Motion und Lifecycle-Recovery müssen denselben Endzustand liefern.

PHASE 5 — VISUELLES MAXIMUM, ABER EIGENSTÄNDIG

Erhalte die bestehende NOVA-Designsprache und verbessere sie systematisch. Keine generischen Emojis, keine Standardbrowser-Buttons, keine kopierten Casino-Assets.

Globale Designregeln:

- Einheitliches Raster, Radien, Schatten, Typografie, Icon-Strichstärke und Motion-Timing.
- Inter für UI/Body und Space Grotesk für Zahlen/Momente beibehalten, sofern bereits so eingebunden.
- Touch-Ziele mindestens 44 × 44 CSS-Pixel.
- Kleine Texte lesbar halten; keine wesentlichen Labels unter sinnvoller Mobilgröße verstecken.
- Kontrast nach WCAG prüfen, ohne das Premiumbild zu zerstören.
- `:focus-visible`, Screenreader-Namen und semantische Dialoge vervollständigen.
- Jede Animation respektiert `prefers-reduced-motion`.

Shark Abyss Art Direction:

- Dunkle Tiefsee mit eigener visueller Identität.
- Bestehenden animierten Hai, Blasen, Wrack-/Felsensilhouetten und Unterwasserlicht vertiefen.
- Dezente Parallaxe für Hintergrundebenen; keine unruhige Dauerbewegung.
- Algen dürfen sanft strömen und müssen beim Countdown materiell reagieren.
- Reel-Frame als nasses, druckfestes Unterwasserglas mit kontrollierten Reflexen.
- Symbole klar, kontrastreich, hochwertig modelliert und auch in Bewegung erkennbar.
- Mehr Tiefe durch Inline-SVG-Gradienten, Highlights und sparsame Filter; keine schweren Rasterbilder.
- Maximal ein bis zwei Signature-Motions gleichzeitig.

Andere Spiele:

- Fruit Reactor: elektrischer Retro-Arcade-Charakter, Metall, Neon und klare klassische Früchte.
- Fancy Harvest: warmer, hochwertiger klassischer Cabinet-Look; häufigere kleine Gewinne dürfen freundlich wirken, ohne Kinderästhetik.
- Tomb of Kings: graviertes Gold, Stein, Staub und warme Fackelbeleuchtung; kein flaches Gelb.

Win-Choreografie:

- Stufen anhand Einsatzmultiplikator konsistent gestalten.
- Count-up, Partikel, Licht, Sound und optionaler Reel-Shake zeitlich synchronisieren.
- Keine Vollbildüberladung bei kleinen Gewinnen.
- Große Gewinne erhalten einen klaren Spannungsbogen und jederzeit eine schnelle, sichere Abschlussmöglichkeit.
- Partikelanzahl dynamisch an Geräteleistung und Reduced Motion anpassen.

PHASE 6 — AUDIO AUF IOS-SAUBER AUFBAUEN

Erstelle eine zentrale Audio Engine statt verstreuter Einzeltöne:

- AudioContext ausschließlich nach bewusster Nutzerinteraktion initialisieren.
- Kontext bei `interrupted`/`suspended` sicher wiederaufnehmen.
- Master-, UI-, Reel-, Win-, Feature- und Music-Bus mit getrennten Gains.
- Keine überlappenden Endlossounds nach Hintergrundwechsel.
- Spinloop beschleunigt und bremst hörbar synchron zu den Walzen.
- Jeder Reel-Stop besitzt Timing und leichte Tonvariation, bleibt aber konsistent.
- Algen-Tick leise und taktil; finaler Reveal klar größer.
- Big-Win-Audio darf nicht clippen; Limiter/Compressor einsetzen.
- Abrupte Starts/Stops mit kurzen Gain-Ramps vermeiden.
- Sound-Off stoppt alle Quellen sauber und bleibt persistent.
- Ausschließlich eigene, lizenzfreie oder prozedural erzeugte Sounds verwenden.
- Kein Remote-Audio, das offline fehlt.

Teste Kopfhörer, Lautsprecher, Lautlosmodus-Verhalten, App-Hintergrund, eingehenden Audio-Fokusverlust und mehrfaches schnelles Spinnen. Dokumentiere iOS-Einschränkungen ehrlich. Nenne `navigator.vibrate()` auf iOS nicht als garantierte Haptik.

PHASE 7 — IPHONE 15 PRO UND PERFORMANCE

Primäres Test-Viewport: 393 × 852 CSS-Pixel im Portrait. Zusätzlich Landscape 852 × 393 sowie kleinere und größere aktuelle Smartphones prüfen.

- `viewport-fit=cover`
- Safe Areas oben/unten/links/rechts
- `100dvh` mit sinnvollem Fallback
- kein Abschneiden durch Dynamic Island oder Home Indicator
- keine horizontale Scrollbar
- kein ungewollter Browser-Zoom
- korrekte Touch-/Pointer-Events
- kontrolliertes Overscroll-Verhalten
- gut bedienbar mit einer Hand
- Spin-Button und Einsatzsteuerung im natürlichen Daumenbereich
- keine Layoutsprünge beim Laden von Fonts
- keine unnötigen Main-Thread-Long-Tasks
- Ziel: flüssige 60 fps auf iPhone 15 Pro; während schwerer Effekte keine dauerhaft sichtbaren Einbrüche
- GPU-Layer sparsam einsetzen; `will-change` nach Animation wieder entfernen
- SVG-/DOM-Komplexität und Partikelbudget messen

Nutze Performance-Traces, nicht nur subjektives Gefühl. Prüfe Speicher nach mindestens 500 Spins auf wachsende Listener, Nodes, AudioNodes, Timer und Animationen.

PHASE 8 — DIREKT ÖFFNBARE HTML UND ECHTE PWA

Zwei Anforderungen gleichzeitig erfüllen:

1. `nova-casino.html` bleibt direkt lokal öffnungsfähig und bietet mindestens den vollständigen Gastmodus ohne Build-Step.
2. Die deployte Webfassung erhält eine korrekte PWA-Hülle.

Für die PWA dürfen ergänzende Dateien angelegt werden:

- `manifest.webmanifest`
- `service-worker.js`
- eigene App-Icons und Maskable Icons, vorzugsweise aus dem eigenen NOVA-Vektorlogo generiert
- optional eine minimale `index.html`, die der kanonischen App entspricht oder auf denselben Build verweist

Anforderungen:

- Homescreen-Installation auf iOS und Android
- Standalone-Modus
- korrekte Theme-/Background-Farben
- Offline App Shell nach erstem erfolgreichen Laden
- versionierter Cache und kontrolliertes Update
- niemals API-Antworten mit privaten Accountdaten oder Spinresultaten unsicher cachen
- Gastmodus offline spielbar
- Accountmodus zeigt offline einen ehrlichen Status und synchronisiert erst nach Wiederverbindung
- keine externen Fonts/Assets als zwingende Startvoraussetzung; falls Google Fonts bleiben, lokale/systemische Fallbacks müssen hochwertig sein

PHASE 9 — TESTMATRIX UND RELEASE-GATES

Implementiere soweit möglich Unit-, Integration- und Browser-E2E-Tests. Nutze mindestens Chromium und WebKit; ein echter iPhone-Safari-Test bleibt zusätzlich Pflicht und darf nicht durch einen Emulator als erledigt markiert werden.

Pflichtfälle je Spiel:

- normaler Verlust
- einfacher Gewinn
- mehrere Linien gleichzeitig
- maximal relevante Symbolkombination
- Wild/Scatter, sofern vorhanden
- Bonusstart
- Freispiele
- Retrigger
- Mystery/Algen
- Expanding Symbol
- Kartenrisiko
- Leiterrisiko
- Gewinn nehmen
- unzureichendes Guthaben
- kostenloses Auffüllen im Gastmodus, falls vorgesehen
- Reload und Appwechsel
- Sound an/aus
- Reduced Motion
- Portrait/Landscape

Globale Release-Gates:

- null uncaught console errors im normalen Ablauf
- null tote Buttons
- null fehlende Assets
- keine dauerhaft aktive Spin-/Blur-Klasse nach Deadline
- 500-Spins-Soak-Test ohne Hänger oder Speicherwachstum
- Settlement-Invariante: Guthaben und Statistik nach Recovery exakt korrekt
- Remote-Replay- und Idempotency-Tests bestanden
- Monte-Carlo-Bericht erzeugt
- Lighthouse/PWA-Prüfung ohne kritische Fehler
- Accessibility-Audit ohne kritische Blocker
- PWA offline nach Erstladen geöffnet
- echte iPhone-Prüfliste dokumentiert
- keine Echtgeld- oder Kaufpfade

PHASE 10 — DEPLOYMENT UND DOKUMENTATION

- Lege keine Secrets in Git oder Clientcode ab. Ein Supabase Publishable Key darf nur mit korrekt geprüfter RLS genutzt werden; Service Role bleibt ausschließlich serverseitig.
- Erstelle eine nachvollziehbare README mit lokalem Start, Gastmodus, Backend-Setup, Supabase-Migrationen, Tests und Deployment.
- Wenn GitHub- und Vercel-Zugang in der Umgebung tatsächlich konfiguriert sind, erstelle ein sauberes Repository, deploye zunächst Preview und nach bestandenen Gates Production.
- Wenn Zugang fehlt, liefere exakte Befehle und Dateien, aber behaupte keine Veröffentlichung.
- Verwende HTTPS.
- Führe nach Deployment denselben Kern-E2E-Test gegen die reale URL aus.

ERWARTETE DATEIEN/ERGEBNISSE

- fertige `nova-casino.html`, direkt lokal spielbar
- deploybare PWA-Dateien
- vorhandener oder neu erstellter Supabase-Ordner mit Migrationen und Edge Functions, falls Online-Modus Bestandteil des Projekts bleibt
- automatisierte Tests
- `AUDIT.md`
- `RTP_REPORT.md`
- `RELEASE_REPORT.md`
- `README.md`

ARBEITSWEISE UND ABSCHLUSS

Arbeite iterativ in kleinen, überprüfbaren Schritten. Bewahre funktionierende Teile. Nimm nach jeder kritischen Änderung mindestens Syntax-, Kernlogik- und Smoke-Tests vor. Bei unklaren Produktentscheidungen wähle keine weitreichende Annahme: kapsle die Option oder dokumentiere die notwendige Entscheidung.

Bezeichne das Projekt erst als fertig, wenn die Release-Gates tatsächlich erfüllt sind. Deine Abschlussantwort enthält kompakt:

1. was geändert wurde,
2. welche Fehlerursachen behoben wurden,
3. welche Tests mit konkreten Ergebnissen liefen,
4. gemessene RTP-Werte,
5. verbleibende bekannte Einschränkungen,
6. Pfad zur direkt öffnungsfähigen HTML,
7. Preview-/Produktionslink, falls wirklich vorhanden,
8. kurze iPhone-Installationsanleitung.

Beginne jetzt mit dem vollständigen Bestandsaudit. Zeige danach den priorisierten Plan und setze ihn anschließend um, statt beim Plan stehenzubleiben.
```

## 4. Empfohlene Übergabe an Claude Code

Lege diese drei Dateien gemeinsam in einen neuen Projektordner:

1. `NOVA-Casino-Claude-Code-Handoff.md`
2. `nova-casino.html`
3. `NOVA-Casino-v6-Premium-Preview-FIXED.html`

Öffne den Ordner mit Claude Code und schreibe anschließend nur:

> Lies `NOVA-Casino-Claude-Code-Handoff.md` vollständig und führe den darin enthaltenen Masterprompt aus. `nova-casino.html` ist die kanonische Hauptfassung. Arbeite selbstständig weiter, bis die belegbaren Release-Gates erfüllt sind.

## 5. Wichtigste Entscheidung für die Fortführung

Nicht wieder bei null anfangen. Die optimale Richtung ist:

**V6.4 Grafik und Online-Funktionen behalten + lokale Stabilität der Premium-Preview gezielt übernehmen + Spin-Lifecycle formal neu absichern + Backend/PWA vollständig und nachweisbar machen.**

