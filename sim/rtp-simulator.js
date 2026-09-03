#!/usr/bin/env node
/*
 * NOVA Casino — Monte Carlo RTP simulator.
 *
 * This does NOT re-implement the paytables. It extracts the four game-math IIFEs
 * verbatim out of nova-casino.html (see extract.js) and runs them in a real Node vm
 * context, so the numbers below are measured against the exact canonical code the
 * browser runs — not a hand-copied approximation that could silently drift.
 *
 * Usage: node rtp-simulator.js [spinsPerSeed] [outFile]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const NOVA_HTML = path.join(__dirname, '..', 'nova-casino.html');
const EXTRACTED_JS = path.join(__dirname, 'game-math.extracted.js');

function extractMathModules() {
  const html = fs.readFileSync(NOVA_HTML, 'utf8');
  const wanted = ['js/game-math.js', 'js/fruit-math.js', 'js/fancy-math.js', 'js/book-math.js'];
  let out = '';
  for (const name of wanted) {
    const startMarker = `/* ${name} */`;
    const startIdx = html.indexOf(startMarker);
    if (startIdx === -1) throw new Error('Kanonisches Mathematik-Modul nicht gefunden: ' + name);
    const endMarker = '\n})();\n';
    const endIdx = html.indexOf(endMarker, startIdx);
    if (endIdx === -1) throw new Error('Ende des Moduls nicht gefunden: ' + name);
    out += html.slice(startIdx, endIdx + endMarker.length) + '\n';
  }
  fs.writeFileSync(EXTRACTED_JS, out);
  return out;
}

// Deterministic, documented, seedable PRNG (mulberry32) — used ONLY by this offline
// simulator for reproducibility. Production spins always use crypto.getRandomValues()
// (see cryptoFloat() inside the extracted module); this seed never touches real play.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadMathModules() {
  const code = fs.existsSync(EXTRACTED_JS) ? fs.readFileSync(EXTRACTED_JS, 'utf8') : extractMathModules();
  const cryptoShim = { getRandomValues: (arr) => crypto.webcrypto.getRandomValues(arr), randomUUID: () => crypto.randomUUID() };
  const sandbox = { window: {}, crypto: cryptoShim, console };
  vm.createContext(sandbox); // sandbox itself becomes globalThis inside the vm realm — no manual aliasing needed
  vm.runInContext('this.globalThis = this;', sandbox);
  vm.runInContext(code, sandbox, { filename: 'game-math.extracted.js' });
  const w = sandbox.window;
  if (!w.__gameMath || !w.__fruitMath || !w.__fancyMath || !w.__bookMath) {
    throw new Error('Extraktion unvollständig — window.__*Math wurde nicht gesetzt.');
  }
  return w;
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function stddev(arr, m) { return Math.sqrt(mean(arr.map(x => (x - m) ** 2))); }

// --- Per-game simulation drivers -------------------------------------------------
// Each driver plays a stateful session (free-spin feature state carried across spins,
// exactly like applySpinSettlement()/patchGameState() do in the app) so free-spin
// frequency, retriggers and feature RTP contribution are captured, not just base spins.

function simulateSharkAbyss(gameMath, spins, rng) {
  const { generateSpin, nextFeatureState, STAKES_CENTS } = gameMath;
  const stakeCents = STAKES_CENTS[1]; // matches app default stakeIndex
  let feature = { remaining: 0, multiplier: 2, stakeCents };
  let wagered = 0, won = 0, hits = 0, featureRounds = 0, featureWon = 0, maxWin = 0, spinsRun = 0;
  const wins = [];
  for (let i = 0; i < spins; i++) {
    const isFreeSpin = feature.remaining > 0;
    const spinStake = isFreeSpin ? feature.stakeCents : stakeCents;
    const spin = generateSpin({ stakeCents: spinStake, isFreeSpin, multiplier: isFreeSpin ? feature.multiplier : 1, rng });
    spinsRun++;
    if (!isFreeSpin) wagered += spinStake;
    won += spin.totalCents;
    wins.push(spin.totalCents / spinStake);
    if (spin.totalCents > 0) hits++;
    if (isFreeSpin) featureWon += spin.totalCents;
    if (!isFreeSpin && spin.freeSpins > 0) featureRounds++;
    if (spin.totalCents > maxWin) maxWin = spin.totalCents;
    feature = nextFeatureState(feature, spin);
  }
  return { wagered, won, hits, spinsRun, featureRounds, featureWon, maxWin, wins, stakeCents };
}

function simulateFlatGame(generateFn, gameLabel, spins, rng, stakeCents) {
  let wagered = 0, won = 0, hits = 0, maxWin = 0;
  const wins = [];
  for (let i = 0; i < spins; i++) {
    const spin = generateFn({ stakeCents, rng });
    wagered += stakeCents;
    won += spin.totalCents;
    wins.push(spin.totalCents / stakeCents);
    if (spin.totalCents > 0) hits++;
    if (spin.totalCents > maxWin) maxWin = spin.totalCents;
  }
  return { wagered, won, hits, spinsRun: spins, maxWin, wins, stakeCents };
}

function simulateTombOfKings(bookMath, stakeCents, spins, rng) {
  const { generateBookSpin, nextBookFeatureState, BOOK_SYMBOLS } = bookMath;
  const regular = Object.keys(BOOK_SYMBOLS).filter(k => k !== 'BOOK');
  let feature = { remaining: 0, multiplier: 1, stakeCents, expandingSymbol: null };
  let wagered = 0, won = 0, hits = 0, featureRounds = 0, featureWon = 0, maxWin = 0, retriggers = 0;
  const wins = [];
  for (let i = 0; i < spins; i++) {
    const isFreeSpin = feature.remaining > 0;
    const spinStake = isFreeSpin ? feature.stakeCents : stakeCents;
    const spin = generateBookSpin({ stakeCents: spinStake, isFreeSpin, expandingSymbol: feature.expandingSymbol, rng });
    if (!isFreeSpin) wagered += spinStake;
    won += spin.totalCents;
    wins.push(spin.totalCents / spinStake);
    if (spin.totalCents > 0) hits++;
    if (isFreeSpin) { featureWon += spin.totalCents; if (spin.freeSpins > 0) retriggers++; }
    if (!isFreeSpin && spin.freeSpins > 0) featureRounds++;
    if (spin.totalCents > maxWin) maxWin = spin.totalCents;
    feature = nextBookFeatureState(feature, spin);
  }
  return { wagered, won, hits, spinsRun: spins, featureRounds, featureWon, maxWin, retriggers, wins, stakeCents };
}

function summarize(gameKey, claimedRTP, result) {
  const rtp = (result.won / result.wagered) * 100;
  const hitFreq = (result.hits / result.spinsRun) * 100;
  const m = mean(result.wins);
  const sd = stddev(result.wins, m);
  return {
    gameKey, claimedRTP, spins: result.spinsRun,
    wageredCents: result.wagered, wonCents: result.won,
    measuredRTP: rtp, deltaPct: rtp - claimedRTP,
    hitFrequencyPct: hitFreq,
    stdDevOfMultiplier: sd,
    standardErrorPct: (sd / Math.sqrt(result.spinsRun)) * 100,
    maxWinCents: result.maxWin, maxWinMultiplier: result.maxWin / result.stakeCents,
    featureRounds: result.featureRounds ?? null,
    featureFrequencyPct: result.featureRounds != null ? (result.featureRounds / result.spinsRun) * 100 : null,
    featureWonCents: result.featureWon ?? null,
    retriggers: result.retriggers ?? null,
  };
}

function runAllGames(w, spinsPerSeed, seed) {
  const rng = mulberry32(seed);
  const stakeCents = w.__gameMath.STAKES_CENTS[1];
  const shark = summarize('shark-abyss', 88.43, simulateSharkAbyss(w.__gameMath, spinsPerSeed, rng));
  const fruit = summarize('fruit-reactor', 88.63, simulateFlatGame(w.__fruitMath.generateFruitSpin, 'fruit-reactor', spinsPerSeed, rng, stakeCents));
  const fancy = summarize('fancy-harvest', 88.22, simulateFlatGame(w.__fancyMath.generateFancySpin, 'fancy-harvest', spinsPerSeed, rng, stakeCents));
  const book = summarize('tomb-of-kings', 87.25, simulateTombOfKings(w.__bookMath, stakeCents, spinsPerSeed, rng));
  return { seed, spinsPerSeed, games: [shark, fruit, fancy, book] };
}

function main() {
  const spinsPerSeed = Number(process.argv[2] || 100000);
  const outFile = process.argv[3] || path.join(__dirname, 'rtp-results.json');
  const w = loadMathModules();
  const seeds = [1, 2, 3, 4, 5];
  const runs = seeds.map(seed => runAllGames(w, spinsPerSeed, seed));
  fs.writeFileSync(outFile, JSON.stringify(runs, null, 2));
  console.log('Wrote', outFile);
  for (const run of runs) {
    console.log(`\n--- seed=${run.seed}  spins/game=${run.spinsPerSeed} ---`);
    for (const g of run.games) {
      console.log(`${g.gameKey.padEnd(14)} RTP=${g.measuredRTP.toFixed(3)}% (claimed ${g.claimedRTP}%, Δ${g.deltaPct >= 0 ? '+' : ''}${g.deltaPct.toFixed(3)}pp, SE±${g.standardErrorPct.toFixed(3)}pp)  hitFreq=${g.hitFrequencyPct.toFixed(2)}%  maxWinX=${g.maxWinMultiplier.toFixed(1)}` + (g.featureFrequencyPct != null ? `  featureFreq=${g.featureFrequencyPct.toFixed(3)}%` : ''));
    }
  }
}

main();
