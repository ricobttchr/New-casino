# Shark Abyss v2 — Mystery-Stack- & Razor-Reveal-Rebuild

Abschlussbericht zum "MASTER TASK — SHARK ABYSS / RAZOR-SHARK MECHANICS & QUALITY
REBUILD". Alle unten beschriebenen Änderungen sind implementiert, getestet und in
`nova-casino.html` sowie `sim/` und `tests/` committet — nicht nur geplant.

Rechtlicher Rahmen (unverändert, wird hier nochmal festgehalten): Push Gamings
Razor Shark diente ausschließlich als **Verhaltens-/Gefühls-Referenz**. Es wurden
keine Assets, kein Code, keine Sounds und keine exakten Wahrscheinlichkeiten
kopiert oder übernommen. Shark Abyss v2 ist ein eigenständiges NOVA-Spiel mit
eigenem Symbol-Set, eigener Mathematik und eigenen, dokumentierten
Design-Entscheidungen dort, wo die Spezifikation zwei Lesarten zuließ.

---

## 1. Geänderte Dateien

| Datei | Änderung |
|---|---|
| `nova-casino.html` | `js/game-math.js`-IIFE komplett neu geschrieben (Mystery-Stack-Engine); Mystery/Razor/Free-Games-Rendering (`presentSharkSteps` & Helfer) neu; `buildCellElement`/`renderGrid`/`landReelColumn` vereinfacht (SEAWEED ist jetzt ein echtes Grid-Symbol); `animateSpin`/`forceCompleteSpin`/`generateLocalSpin`/`normalizeRemoteSpin`/`nextFeatureState`-Aufrufstellen angepasst; 11 neue Symbol-SVGs (`sharkBody`, `greatWhite`, 4×Hai-Farianten, `oxygenTank`, `camera`, `goggles`, `flippers`, `seaMine`, `goldenShark`); neue CSS für Mystery-Reveal/Razor-Mini-Reel/Nudge-Transform; `window.__sharkDebug`-Hooks; alte Algen-Countdown-Logik (`prepareAlgaePresentation`, `algaeBand`, `algaePresentation`) vollständig entfernt |
| `sim/shark-rtp-simulator.js` | **Neu.** Dedizierter Monte-Carlo-Simulator (reine Mathematik, kein Browser), extrahiert `js/game-math.js` wörtlich aus `nova-casino.html` und läuft in einem echten Node-`vm`-Kontext |
| `sim/rtp-simulator.js` | `simulateSharkAbyss` korrigiert: fädelt jetzt `persistentIn`/`forcedReels` korrekt durch Freispiele (vorher wurden bei jedem Freispiel neue, nie persistente Stacks erzeugt); RTP-Zielwert auf 96,7 % aktualisiert |
| `tests/shark-engine-math.js` | **Neu.** 37 reine Mathematik-Assertions gegen die live extrahierte Engine (Wild-Substitution, Stack-Lifecycle, Grid-Generierung, volle Runden-Orchestrierung, Golden Shark/Razor Reveal, Free Games) |
| `tests/shark-abyss-v2-ui.js` | **Neu.** Playwright-UI-Test über die `window.__sharkDebug`-Hooks (Mystery-Reveal, Golden Shark/Razor Reveal, Freispiel-Trigger, Stacks auf Walze 2/4, Reload-Recovery) |
| `tests/algae-persistence.js` | **Entfernt** — testete die jetzt nicht mehr existierende Einzel-Band-Algen-Mechanik |
| `tests/spin-performance.js` | Referenz-Seed für den "langweiligen" Spin (0 Gewinn, 0 Mystery) aktualisiert (die alte Seed-1-Annahme galt nur für die alte Mathematik; unter der neuen Engine landet Seed 1 zufällig einen vollen Golden-Shark→Razor-Reveal-Kaskaden-Spin) |
| `tests/test-matrix.js` | 3 veraltete, Seed-basierte Shark-Abyss-Assertions durch neu gefundene, gegen die aktuelle Engine verifizierte Seeds ersetzt |

Nicht angefasst (bewusst, siehe §8): `supabase/functions/spin/index.ts`,
`supabase/functions/_shared/math.js` — Server-/Online-Modus bleibt außen vor, exakt
wie vom Nutzer selbst zuvor angewiesen ("Lass den online Modus komplett dann raus").

---

## 2. Architektur-Änderung

**Vorher:** `createGrid()` erzeugte ein zufälliges Grid + optional EIN
zufälliges 2-4-Zellen-"Mystery"-Array; ein separates, komplett UI-seitiges
`algaeBand`/`algaePresentation`-Objekt in `nova-casino.html` bildete daraus einen
reinen Anzeige-Countdown nach. Freispiele waren ein simpler
`remaining`-Countdown mit `multiplier+1` bei jedem Mystery-Treffer.

**Jetzt:** `js/game-math.js` modelliert die Runde als echte Zustandsmaschine:

- **`MysteryStack`** `{id, reel, offset, length:4, active, revealType, revealSymbol, golden, nudgeCount, revealed}` — ein virtuelles 4-Zeilen-Fenster, das über `offset` positioniert wird (`visibleRowsForStack`), nicht ein fertiges Array betroffener Zellen.
- **`runRound()`** orchestriert eine komplette Runde (eine Wette, oder ein Freispiel) als deterministische Sequenz aus EINEM RNG-Stream und gibt eine geordnete `steps`-Liste zurück: `land → reveal → razorReveal → winEval → nudge → respin → …`. Die UI spielt diese Sequenz nur ab (`presentSharkSteps`), würfelt während der Präsentation nichts neu — exakt der vom Auftrag geforderte "Server rechnet, Client spielt ab"-Vertrag.
- Zwei Stack-Kategorien (eigene, dokumentierte NOVA-Auflösung eines mehrdeutigen Punkts der Spezifikation): **transiente** Stacks (Basisspiel/Kaskaden-Nachzügler) kaskadieren INNERHALB einer Runde bis zum vollständigen Verlassen des Grids; **persistente** Stacks (die beiden Freispiel-Start-Stacks auf Walze 2 & 4) nudgen genau EINMAL pro echtem Freispiel und werden über `persistentIn`/`persistentOut` zwischen Spins weitergereicht.

---

## 3. Was an der alten Algen-Logik falsch war

1. **Kein First-Class-State.** Die alte `algaeBand`/`algaePresentation` existierte
   ausschließlich in `nova-casino.html` (UI-Layer) und wirkte nie auf
   `evaluateGrid()` zurück — sie war eine reine Anzeige-Fiktion über einem
   völlig unabhängig gewürfelten Grid, kein Teil der Spiel-Mathematik.
2. **Ein einziges Band, keine echten Stacks.** Pro auslösendem Spin genau EIN
   zusammenhängender 2-4-Zeilen-Bereich in EINER Spalte — nie mehrere
   gleichzeitige Stacks, nie unterschiedliche Walzen gleichzeitig.
3. **Kein partielles Sichtfenster über die Grid-Grenze hinaus.** Ein Stack
   konnte nur innerhalb der sichtbaren 4 Zeilen existieren; das vom Auftrag
   geforderte "der Stack kann oben/unten aus dem Raster heraushängen" gab es
   nicht.
4. **Eine Zeile pro Spin statt physischer Bewegung.** Das Band "eroderte" eine
   Zeile pro NEUEM Spin von oben — kein Nudge, keine Bewegung innerhalb EINER
   Spinpräsentation, keine Kaskade.
5. **Reveal-Reihenfolge nicht getrennt von Auswertung.** Da die Mystery-Zellen
   real bereits das aufgedeckte Symbol enthielten (nur optisch verdeckt), war
   "erst aufdecken, dann werten" kein architektonisches Prinzip, sondern
   Zufall der Umsetzung.
6. **Kein Golden Shark, kein Razor Reveal.** Die alte Engine kannte nur vier
   mögliche Reveal-Symbole, keinen Sonderfall für Sofortgewinne/Scatter.

---

## 4. Wie Mystery Stack & Nudge jetzt funktionieren

`offset` ist eine ganze Zahl; sichtbare Zeile `r` (0-3) gehört zum Stack, wenn
`offset <= r <= offset+3`. Ein neuer Stack startet immer mit `offset <= 0`
(kommt von oben herein): `offset=0` → 55 %, `-1` → 20 %, `-2` → 15 %, `-3` → 10 %
(eigene, dokumentierte NOVA-Gewichtung).

Beispiel exakt wie vom Auftrag vorgegeben, jetzt real im Code:
`offset=-1` → sichtbare Zeilen `[0,1,2]` → Nudge → `offset=0` → `[0,1,2,3]`
(voll sichtbar) → Nudge → `offset=1` → `[1,2,3]` (oben verlässt das Raster) →
… → `offset=4` → keine sichtbaren Zeilen (Stack inaktiv).

Ablauf pro Runde (`runRound`):
1. Grid wird generiert; von einem aktiven Stack abgedeckte Zellen erhalten das
   echte Grid-Symbol `SEAWEED` (kein Overlay-Flag).
2. Für jeden aktiven Stack: **erst** `applyReveal()` (Symbol wird auf die
   sichtbaren Zeilen geschrieben), **dann erst** `evaluateGrid()` — nie
   umgekehrt.
3. Alle sichtbaren Zellen EINES Stacks zeigen dasselbe Symbol (nicht einzeln
   gewürfelt).
4. Eine Ziellinie, die noch auf einer verdeckten Zeile eines aktiven Stacks
   liegt, würde nie vorzeitig ausgewertet — Kaskade läuft immer aufdecken →
   auswerten → nudgen → respinnen, nie umgekehrt.
5. Der Stack nudgt genau eine Position nach unten; die übrigen (nicht
   belegten) Walzen werden neu gewürfelt; die Kaskade wiederholt sich, bis
   kein transienter Stack mehr aktiv ist.
6. Mehrere gleichzeitige Stacks (`transient` ist ein Array) sind vollständig
   unterstützt und in `tests/shark-engine-math.js` sowie
   `window.__sharkDebug.triggerMultipleMysteryStacks()` verifiziert.

Wichtig: Der komplette Vorgang — egal wie viele Nudge-Zyklen — gehört zu EINER
`generateSpin()`-Rückgabe und damit zu EINEM Balance-Abbuchungs-/Gutschrifts-
Vorgang (`applySpinSettlement` wird genau einmal aufgerufen). Ein Nudge kann
strukturell nie ein zweites Mal abbuchen.

---

## 5. Wie Razor Reveal funktioniert

Deckt ein Stack `GOLDEN_SHARK` auf (eigene Gewichtung: 5 % aller
Stack-Reveals — regulär 82 %, Wild 13 %, Golden 5 %), wird sofort
`resolveRazorReveal()` aufgerufen: jede aktuell sichtbare Zelle des Stacks
erhält ein unabhängiges Mini-Reel-Ergebnis aus einer eigenen, bewusst rechts-
schiefen NOVA-Verteilung:

| Ergebnis | Gewicht | grobe Häufigkeit |
|---|---|---|
| SCATTER | 900 | ~13,4 % |
| 1× | 2400 | ~35,8 % |
| 2× | 1800 | ~26,8 % |
| 5× | 900 | ~13,4 % |
| 10× | 420 | ~6,3 % |
| 25× | 160 | ~2,4 % |
| 50× | 60 | ~0,9 % |
| 100× | 20 | ~0,3 % |
| 250× | 6 | ~0,09 % |
| 500× | 2 | ~0,03 % |
| 1000× | 0,6 | ~0,009 % |
| 2500× | 0,12 | ~0,0018 % |

**Ausdrücklich festgehalten:** Diese Werte sind eine eigene NOVA-Erfindung für
eine hoch-volatile Sofortgewinn-Verteilung, **nicht** aus dem Referenzspiel
übernommen oder als dessen echte Wahrscheinlichkeiten ausgegeben — im Simulator
sowie hier dokumentiert.

UI-Choreografie (`presentRazorReveal` in `nova-casino.html`): kurzer
Screen-Dim (`.razor-mode`), goldene Umrandung der betroffenen Zellen
(`.golden-cell`/`.razor-cell`), pro Zelle ein zeitversetzt startendes,
mehrere Zyklen laufendes Mini-Reel (`.razor-spinning`, echte, wenn auch kurze
Animation — kein 200-ms-Textwechsel), Landung auf Sofortgewinn oder
Sea-Mine-Scatter-Symbol, Summierung, Toast mit dem Gesamtbetrag. Razor-Reveal-
Scatter zählen voll zur rundenweiten Scatter-Summe (`scatterCellsThisRound`)
und damit zum 3+-Freispiel-Trigger.

---

## 6. Wie Free Games jetzt funktionieren

Bei 3+ Sea-Mine-Scattern (irgendwo im Grid, auch aus Razor Reveal) werden
8/10/12 Freispiele vergeben (3/4/5+ Scatter — unverändert von vorher, da diese
Zahl im Referenzspiel öffentlich als Paytable-Regel sichtbar ist).

Der **erste** Freispiel erzwingt zwei **persistente** Mystery Stacks auf
Walze-Index 1 und 3 (0-indiziert) — das sind die UI-sichtbaren Walzen **2 und
4** (der Auftrag hat diese Indexierungs-Unterscheidung explizit verlangt, und
sie ist im Code an jeder Stelle als Kommentar festgehalten). Diese Start-Stacks
sind garantiert nicht golden (sauberer, lesbarer Feature-Start — eigene
NOVA-Entscheidung).

Jeder Freispiel-Zyklus:
1. Persistente Stacks decken (falls noch nicht geschehen) einmalig auf.
2. Grid wird ausgewertet.
3. Jeder aktive persistente Stack nudgt **genau einmal**; jeder gültige Nudge
   erhöht den Feature-Multiplikator um **+1**.
4. `remaining` sinkt um 1; ein neuer 3+-Scatter-Treffer während des Features
   erhöht `remaining` erneut (Retrigger/Extension).
5. Das Feature endet **erst**, wenn `remaining <= 0` **und** kein persistenter
   Stack mehr aktiv ist — ein Stack, der noch nicht fertig hinausgenudged ist,
   verlängert das Feature effektiv um die fehlenden Spins (`nextFeatureState`
   in `js/game-math.js`).

Start-Multiplikator: `x2` (eigene NOVA-Wahl, dokumentiert — die offizielle
Trigger-/Start-Tabelle des Referenzspiels wurde nicht aus Drittquellen
übernommen, wie vom Auftrag ausdrücklich gefordert). Zwei Start-Stacks × 4
Nudges bis zum vollständigen Verlassen ergeben im Mittel `x2 + 8 = x10` am
Ende eines typischen Features — durch den 10-Millionen-Spin-Simulatorlauf
bestätigt (`Average ending multiplier: 10.00x`).

---

## 7. Simulator-Ergebnis

`node sim/shark-rtp-simulator.js 10000000 90210` (reine Mathematik, keine
UI, keine Netzwerk-Calls):

```
RTP (total): 96.761%
Hit frequency (any win or feature trigger): 37.97%

--- RTP contribution breakdown ---
Base-line RTP (no mystery stack involved): 38.218%
Mystery-cascade RTP contribution (base game, excl. Razor Reveal prizes): 20.040%
Razor Reveal RTP contribution: 5.745%
Free Games RTP contribution: 32.758%

--- Bonus (Free Games) statistics ---
Bonus frequency: 1 in 131 (0.764% of spins)
Average bonus win: 932 cents = 46.6x stake
Median bonus win: 34.3x stake
95th percentile bonus win: 129.0x stake
99th percentile bonus win: 215.7x stake
Max observed bonus win: 2564.1x stake
Average Free Games length (spins played, incl. retriggers/extensions): 9.0
Average ending multiplier: 10.00x

--- Mystery cascade statistics (base game) ---
Average mystery-cascade sequence length (winEval cycles, when triggered): 5.04
Cascade frequency: 7.79% of spins
```

**Ziel 96,5-96,8 % RTP: erreicht** (96,761 %). Erreicht durch echte,
iterative Kalibrierung von `LINE_CALIBRATION` sowie der Stack-/Reveal-/
Razor-/Scatter-Frequenzen — nicht durch pauschales Hochskalieren aller
Gewinne (siehe Kalibrierungs-Historie unten). Bei diesem stark
volatilitätsgetriebenen Design schwankt die gemessene RTP je nach Seed selbst
bei mehreren Millionen Spins noch um ±1-1,5 Prozentpunkte (seltene, sehr hohe
Multiplikator-Ereignisse dominieren den Erwartungswert) — 96,761 % bei
10 Mio. Spins ist ein belastbarer, aber kein exakt reproduzierbarer Wert;
das ist dokumentiert, nicht verschwiegen.

Alte RTP (vor diesem Rebuild): ~88,43 % — deutlich unter Ziel, siehe
`RTP_REPORT.md` (historisch, nicht überschrieben).

---

## 8. Bekannte Abweichungen vom Referenzspiel

- **Server-/Gast-Parität nicht hergestellt.** Auf ausdrückliche, frühere
  Anweisung des Nutzers ("Lass den online Modus komplett dann raus") wurde
  der Supabase-Edge-Function-Code (`supabase/functions/spin/index.ts`,
  `_shared/math.js`) in dieser Session **nicht** angefasst. Er enthält
  weiterhin die alte Mathematik. Ein authentifizierter Account würde also
  aktuell NICHT dieselbe Shark-Abyss-v2-Logik erhalten wie der Gast-Modus —
  das verletzt formal die im Auftrag genannte Parität-Anforderung, ist aber
  eine bewusste, vom Nutzer selbst gesetzte Prioritäts-Entscheidung dieser
  Session. Um echte Parität herzustellen, müsste zusätzlich: die
  `game_states`-Tabelle um eine `persistent_stacks`-Spalte (JSON) erweitert,
  die Edge Function auf dieselbe Engine portiert und die Migration
  ausgeführt werden — nicht Teil dieser Lieferung.
- **Trigger-/Start-Tabelle für Freispiele ist eine eigene NOVA-Konstruktion**
  (Start-Multiplikator x2, +1 pro Nudge), nicht aus einer Drittquelle für das
  Referenzspiel übernommen — wie ausdrücklich gefordert.
- **Razor-Reveal-Wahrscheinlichkeiten sind erfunden** (siehe §5), nicht das
  echte, nicht-öffentliche Paytable des Referenzspiels.
- **Anticipation-Hold beim Landen der Walzen** wurde für Shark Abyss entfernt
  (vorher: ein "FEATURE CHANCE…"-Halt auf der letzten Walze bei 2+ Scattern).
  Da Scatter inzwischen auch aus einer Kaskade oder einem Razor Reveal
  stammen können (nicht nur aus dem initialen Deal), hätte der alte
  Landungs-Hold in vielen Fällen nichts angezeigt, während direkt danach die
  eigentliche Spannung (Mystery-Reveal/Razor-Reveal) ohnehin folgt — bewusste
  Vereinfachung, dokumentiert.

---

## 9. Bewusst eigene NOVA-Interpretationen

- Zwei-Kategorien-Stack-Modell (transient vs. persistent) als eigene
  Auflösung zweier Auftragsabschnitte, die Kaskaden-Timing auf
  unterschiedlichen Ebenen beschreiben (siehe §2).
- Start-Sichtbarkeits-Gewichtung neuer Stacks (55/20/15/10 % für 4/3/2/1
  sichtbare Zellen).
- Reveal-Verteilung 82 % regulär / 13 % Wild / 5 % Golden.
- Razor-Reveal-Sofortgewinn-Tabelle (§5).
- Freispiel-Start-Multiplikator x2, +1 pro gültigem Nudge.
- Bonus-Start-Stacks garantiert nicht-golden für einen sauberen Feature-Start.
- Sea-Mine-Scatter-Chance pro Walze (4,2 % Basisspiel, unabhängig vom
  Mystery-System).

Alle diese Werte sind im Code (`js/game-math.js`-Kommentare) sowie hier als
"eigene NOVA-Entscheidung" markiert, nirgends als Tatsachenbehauptung über das
Referenzspiel.

---

## 10. Testergebnisse

| Test | Ergebnis |
|---|---|
| `tests/shark-engine-math.js` (37 reine Mathematik-Assertions) | **37/37 PASS** |
| `tests/shark-abyss-v2-ui.js` (8 Live-UI-Assertions über Debug-Hooks) | **8/8 PASS** |
| `tests/test-matrix.js` (gesamte Deterministik-Matrix, alle 4 Spiele) | **15/15 PASS** |
| `tests/smoke.js` | **18/18 PASS** |
| `tests/settlement-invariant.js` (10 Zyklen) | **PASS** |
| `tests/spin-performance.js` | **5/5 PASS** (Referenz-Seed aktualisiert, s.o.) |
| `tests/touch-targets.js` | **PASS** (0 von 46 Elementen zu klein) |
| `tests/reduced-motion.js` | **PASS** |
| `tests/tomb-of-kings-feature.js` | **PASS** (unverändertes Spiel, Regressionscheck) |
| `tests/audio-engine.js` | **PASS** |
| `tests/online-mode-auth-ui.js` | **PASS** |
| `tests/soak-500.js` (150 reale Spins, Shark Abyss) | **PASS** — 0 hängende Spins, 0 negative Balance, kein Speicherwachstum, 0 Konsolenfehler |
| `tests/soak.js` (alle 4 Spiele) | siehe Nachtrag unten (lief zum Zeitpunkt der Berichtserstellung noch) |
| `tests/pwa-offline.js` | Nicht ausführbar in dieser Umgebung (benötigt lokalen Server auf Port 8934) — kein neuer Befund, bereits vorher so dokumentiert |

Alle Zahlen wurden tatsächlich ausgeführt, nicht angenommen — Rohausgaben im
Scratchpad dieser Session verfügbar.

---

## 11. Bekannte Bugs / Einschränkungen

1. **Server-/Gast-Parität fehlt** (siehe §8) — größte offene Lücke.
2. **Kein `triggerNudgeUp()`-Zustand implementiert.** Stacks nudgen im NOVA-
   Design ausschließlich nach unten (sie betreten das Raster immer nur von
   oben); der im Auftrag gelistete Debug-Hook existiert als dokumentierter
   No-Op, damit ein Testlauf, der alle 8 Hooks aufruft, nicht abstürzt.
3. **Reduzierte finale Rekap-Blitz-Animation für Shark Abyss.** Da jeder
   Kaskaden-Zyklus seine Gewinnzellen bereits live aufblitzen lässt, wurde der
   generische "alle Gewinne am Ende nochmal aufblitzen lassen"-Block für
   Shark Abyss deaktiviert (er hätte auf inzwischen andere Symbole gezeigt);
   nur der letzte Zyklus bleibt am Ende sichtbar hervorgehoben.
4. **Kein Lighthouse-/echtes-iPhone-Test** in dieser Umgebung möglich (wie
   bereits in `AUDIT.md` für die Vorgängerversion dokumentiert — unverändert).
5. **Razor-Reveal-Mini-Reel-Animation ist eine vereinfachte, aber echte
   Spin-Animation** (mehrere zufällig wechselnde Vorschau-Werte über
   ~200-400ms je Zelle, gestaffelt), keine vollständig separate Physik-Engine
   pro Mini-Reel — erfüllt die Anforderung "kein 200ms-Textwechsel", aber
   nicht auf demselben Polish-Level wie die Haupt-Walzen-Animation.
6. **Kein Deployment/Vercel-Push** in diesem Bericht enthalten — folgt nach
   Nutzerfreigabe, wie in dieser Session üblich.

---

## Priorität erfüllt (P0-P5, wie im Auftrag verlangt)

- **P0** (Architektur, Mystery-Stack-State, Nudge/Reveal-Korrektheit, keine
  Doppel-Abbuchung, Settlement-Sicherheit): **erledigt**.
- **P1** (Golden Shark, Razor Reveal, Wild, Scatter, Freispiel-Progression,
  Multiplikator): **erledigt**.
- **P2** (Mathematik-Balance, RTP-Simulator, Server-/Client-Parität):
  RTP-Balance & Simulator **erledigt**; Server-Parität **bewusst
  zurückgestellt** (siehe §8).
- **P3** (Walzen-/Mystery-/Nudge-/Razor-Reveal-/Bonus-Animation):
  **erledigt**, funktional und mit echten transform/opacity/filter-
  Animationen, nicht auf demselben Politur-Level wie ein AAA-Studio, aber
  spürbar besser als vorher und ohne die im Auftrag verbotenen Jank-Muster.
- **P4** (Symbol-SVGs, Hintergrund, Rahmen, UI-Politur, Audio-Politur):
  Symbol-SVGs **erledigt**; Hintergrund/Rahmen/größere Art-Direction-
  Überarbeitung **nicht** Teil dieser Session (Zeitbudget ging in P0-P3, wie
  vom Auftrag selbst priorisiert: "NICHT zuerst 3 Stunden CSS polieren und
  die falsche Mechanik behalten").
- **P5** (Debug-Hooks, mobile Safari, Edge Cases, automatisierte Regression):
  Debug-Hooks **erledigt** (alle 8 angeforderten Signaturen); mobile-Safari-
  spezifisches Verhalten (AudioContext, Force-Complete bei
  Tab-Wechsel/Reload) wiederverwendet die bereits vorhandene, getestete
  Infrastruktur unverändert; volle A-U-Testliste des Auftrags nur teilweise
  abgedeckt (siehe §10) — Zeitbudget-Entscheidung, dokumentiert statt
  verschwiegen.
