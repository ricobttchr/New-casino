# NOVA Casino — RTP-/Monte-Carlo-Report

Erzeugt mit `sim/rtp-simulator.js`. Reproduzierbar: `node sim/rtp-simulator.js <spins> <outFile>`.

## Methodik

- Der Simulator liest `nova-casino.html`, extrahiert die vier Mathematik-IIFEs
  (`js/game-math.js`, `js/fruit-math.js`, `js/fancy-math.js`, `js/book-math.js`)
  **wortwörtlich** und führt sie in einem echten Node-`vm`-Kontext aus — es handelt sich
  nicht um eine von Hand nachgebaute Zweitimplementierung, die von der kanonischen
  Quelle abweichen könnte. Extrahierter Code liegt zur Nachvollziehbarkeit unter
  `sim/game-math.extracted.js`.
- RNG: `mulberry32`, ein dokumentierter, seedbarer PRNG — ausschließlich für diesen
  Offline-Simulator. Produktion verwendet ausnahmslos `crypto.getRandomValues()`
  (`cryptoFloat()` in `js/game-math.js`); der Seed berührt kein reales Spiel.
- Freispiele/Feature-State werden über die Session hinweg fortgeführt (`nextFeatureState`
  bzw. `nextBookFeatureState`), genau wie `applySpinSettlement()`/`patchGameState()` es
  im Client tun — nicht nur isolierte Einzelspins.
- Fünf feste Seeds (1–5) je Stichprobengröße, damit Varianz sichtbar wird statt eine
  einzelne Zahl überzuinterpretieren. Standardfehler (SE) ist die
  Stichproben-Standardabweichung der Multiplikator-Verteilung geteilt durch √n.

## Ergebnis bei 1.000.000 Spins je Spiel und Seed (5.000.000 Spins gesamt je Spiel)

Vollständige Rohdaten: `sim/rtp-results-1m.json`.

### Shark Abyss (Ziel-RTP: 88,43 %)

| Seed | RTP | Δ zur Zielangabe | SE | Hit-Freq. | Feature-Freq. | Max Win (×Einsatz) |
|---|---|---|---|---|---|---|
| 1 | 88,389 % | −0,041pp | ±0,190pp | 41,39 % | 0,603 % | 149,0× |
| 2 | 89,026 % | +0,596pp | ±0,193pp | 41,46 % | 0,616 % | 194,2× |
| 3 | 88,211 % | −0,219pp | ±0,189pp | 41,31 % | 0,607 % | 146,6× |
| 4 | 87,944 % | −0,486pp | ±0,190pp | 41,36 % | 0,589 % | 171,4× |
| 5 | 88,349 % | −0,081pp | ±0,189pp | 41,35 % | 0,617 % | 109,9× |
| **gepoolt (5 Mio.)** | **88,384 %** | **−0,046pp** | | 41,37 % | 0,607 % | 194,2× |

### Fruit Reactor (Ziel-RTP: 88,63 %)

| Seed | RTP | Δ | SE | Hit-Freq. | Max Win |
|---|---|---|---|---|---|
| 1 | 88,496 % | −0,134pp | ±0,355pp | 29,31 % | 275,2× |
| 2 | 88,112 % | −0,518pp | ±0,355pp | 29,35 % | 549,3× |
| 3 | 88,563 % | −0,067pp | ±0,367pp | 29,27 % | 549,3× |
| 4 | 88,539 % | −0,091pp | ±0,362pp | 29,31 % | 549,3× |
| 5 | 87,712 % | −0,918pp | ±0,348pp | 29,19 % | 275,2× |
| **gepoolt (5 Mio.)** | **88,284 %** | **−0,346pp** | | 29,29 % | 549,3× |

### Fancy Harvest (Ziel-RTP: 88,22 %)

| Seed | RTP | Δ | SE | Hit-Freq. | Max Win |
|---|---|---|---|---|---|
| 1 | 87,724 % | −0,496pp | ±0,311pp | 26,77 % | 167,8× |
| 2 | 87,519 % | −0,701pp | ±0,310pp | 26,82 % | 167,8× |
| 3 | 87,520 % | −0,700pp | ±0,310pp | 26,75 % | 190,0× |
| 4 | 88,117 % | −0,103pp | ±0,317pp | 26,82 % | 190,0× |
| 5 | 87,456 % | −0,764pp | ±0,306pp | 26,77 % | 163,0× |
| **gepoolt (5 Mio.)** | **87,667 %** | **−0,553pp** | | 26,79 % | 190,0× |

### Tomb of Kings (Ziel-RTP: 87,25 %)

| Seed | RTP | Δ | SE | Hit-Freq. | Feature-Freq. | Retrigger | Max Win |
|---|---|---|---|---|---|---|---|
| 1 | 87,281 % | +0,031pp | ±0,381pp | 28,28 % | 0,733 % | 567 | 570,7× |
| 2 | 85,165 % | −2,085pp | ±0,363pp | 28,11 % | 0,706 % | — | 570,7× |
| 3 | 86,670 % | −0,580pp | ±0,371pp | 28,28 % | 0,710 % | — | 570,7× |
| 4 | 85,935 % | −1,315pp | ±0,346pp | 28,24 % | 0,710 % | — | 574,2× |
| 5 | 86,154 % | −1,096pp | ±0,367pp | 28,21 % | 0,722 % | — | 1044,0× |
| **gepoolt (5 Mio.)** | **86,241 %** | **−1,009pp** | | 28,22 % | 0,716 % | | 1044,0× |

## Bewertung

- **Shark Abyss** konvergiert exzellent gegen den ausgewiesenen Wert (−0,046pp bei
  5 Mio. Spins, deutlich innerhalb der angestrebten ±0,15pp-Toleranz).
- **Fruit Reactor** liegt mit −0,346pp leicht außerhalb der ±0,15pp-Zielspanne, aber
  nahe genug, dass es im Rahmen für kalibrierte Slots ohne separates Handeln vertretbar
  erscheint — insb. da `FRUIT_CALIBRATION=.54928` als expliziter Tuning-Faktor existiert
  und mit dieser Datenlage nur eine minimale Nachjustierung (~ +0,4 % relativ) bräuchte,
  falls exakte Deckungsgleichheit gewünscht ist.
- **Fancy Harvest** liegt konsistent bei −0,55pp (alle 5 Seeds liegen unterhalb des
  Zielwerts, mehrere Seeds außerhalb ihres eigenen SE-Bands) — das ist ein
  **systematischer, kein zufälliger** Unterschied. Ursache identifiziert: Im Gegensatz
  zu Shark Abyss (`LINE_CALIBRATION`), Fruit Reactor (`FRUIT_CALIBRATION`) und Tomb of
  Kings (`BOOK_CAL`) besitzt Fancy Harvest **keinen Kalibrierungsfaktor** in
  `js/fancy-math.js` — die RTP ergibt sich ungetuned direkt aus Symbolgewichten und
  Paytable. Der im UI ausgewiesene Wert "88,22 % simuliert" war damit vermutlich das
  Ergebnis einer früheren, kleineren Stichprobe oder einer inzwischen abweichenden
  Konfiguration.
- **Tomb of Kings** zeigt die größte Abweichung (−1,01pp gepoolt, in 4 von 5 Seeds
  außerhalb des SE-Bands) — ebenfalls systematisch, nicht Rauschen. Die
  Freispielhäufigkeit (~0,72 %) ist klein genug, dass die Feature-Auszahlung selbst bei
  5 Mio. Spins (~36.000 Freispielrunden gesamt) noch eine spürbare Restvarianz trägt;
  zusätzlich prägt `BOOK_CAL=.696` die Basisspiel-RTP direkt.

**Es wurde bewusst keine Spielmathematik verändert**, um diese Abweichungen "wegzurechnen"
— das widerspräche der Vorgabe, RTP-Zielwerte nicht ohne begründete, nachvollziehbare
Korrektur stillschweigend zu verschieben. Stattdessen: Ursache pro Spiel benannt (siehe
oben), Vorher/Nachher-Zahlen offengelegt. Empfehlung für eine bewusste Produktentscheidung:
entweder die UI-Texte ("88,22 % simuliert" / "87,25 % simuliert") auf die neu gemessenen
Werte aktualisieren, oder — falls die ursprünglichen Zielwerte verbindlich sind — gezielt
einen Kalibrierungsfaktor in `fancy-math.js` ergänzen bzw. `BOOK_CAL` in `book-math.js`
nachjustieren und die Änderung erneut mit dieser Simulation verifizieren.

## Finale Kalibrierung: 5.000.000 Spins je Spiel und Seed

<!-- RTP_5M_RESULTS_PLACEHOLDER -->
Läuft zum Zeitpunkt der Erstellung dieses Dokuments noch im Hintergrund (gestartet,
~20 Minuten Laufzeit erwartet für 4 Spiele × 5 Seeds × 5.000.000 Spins). Ergebnis wird
nachgetragen, sobald verfügbar — siehe `sim/rtp-results-5m.json` für die Rohdaten, falls
diese Datei zum Zeitpunkt des Lesens bereits vollständig geschrieben ist.

## Weitere geprüfte Aspekte

- **Gesamteinsatz vs. Linienbet**: `lineBetCents = stakeCents / PAYLINES.length` in allen
  vier Spielen — der ausgewiesene Gesamteinsatz wird korrekt auf die Linienzahl verteilt
  (20 bei Shark Abyss, 5 bei Fruit Reactor/Fancy Harvest, 10 bei Tomb of Kings).
- **Rundung**: Jede Linien- und Scatter-Auszahlung wird einzeln mit `Math.round()` auf
  ganze Cent gerundet (`evaluateGrid`, `evaluateFruitGrid`, `evaluateFancyGrid`,
  `lineWins`/`scatterResult`/`expansionResult`), dann aufsummiert — das ist konsistent
  über alle vier Spiele und über Simulator wie Client identisch, da beide dieselbe
  Funktion aufrufen.
- **Free-Spin-Wins/Multiplikatoren, Retrigger, Mystery/Algen, Expanding Symbol**: fließen
  über den Session-Loop (`nextFeatureState`/`nextBookFeatureState`) in obige Zahlen ein
  (siehe Spalten Feature-Freq./Retrigger); die Algen-Countdown-/Reveal-Optik selbst hat
  keinen Effekt auf die Auszahlung — sie zeigt nur ein bereits erzeugtes Ergebnis an.
- **Max-Win-Cap**: Kein explizites Cap im Code gefunden (`MAX_WIN` o. ä. kommt in keinem
  der vier Mathematik-Module vor). Beobachtete Maxima liegen bei 5 Mio. Spins zwischen
  ~190× (Fancy Harvest) und ~1044× (Tomb of Kings) des Einsatzes je Spin — ohne Cap kann
  ein einzelner Spin bei genügend Versuchen theoretisch höher ausfallen. Dies als
  Produktentscheidung markiert: Falls ein verantwortungsvolles Spieldesign einen
  Max-Win-Cap verlangt (in Social Casinos üblich, z. B. 500× oder 1000× Einsatz), müsste
  er explizit in `evaluateGrid`/`evaluateFruitGrid`/`evaluateFancyGrid`/`lineWins`
  ergänzt werden — nicht in dieser Session vorgenommen, da das eine bewusste
  Mathematik-Änderung wäre.
- **Gleichheit lokaler und serverseitiger Auswertung**: Der in dieser Session neu
  verdrahtete Gastmodus (`generateLocalSpin()` in `nova-casino.html`) ruft exakt
  dieselben `generateSpin`/`generateFruitSpin`/`generateFancySpin`/`generateBookSpin`
  auf wie das, was ein serverseitiger Aufruf mit derselben Konfiguration ausführen
  müsste — da kein Zugriff auf den tatsächlichen Server-Code bestand (siehe
  `RELEASE_REPORT.md`), konnte die Übereinstimmung mit dem *tatsächlich deployten*
  Server nicht verifiziert werden, wohl aber die interne Konsistenz: Simulator, Client-
  Gastmodus und (laut Code) Client-Erwartung an den Server verwenden alle denselben
  Quelltext aus `nova-casino.html`.
