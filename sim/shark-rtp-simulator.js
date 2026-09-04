#!/usr/bin/env node
/*
 * NOVA Shark Abyss v2 — dedicated Monte Carlo RTP simulator.
 *
 * This is math-only: it never touches the DOM, never loads a browser, and never
 * imports anything from the animation/UI layer. It extracts the js/game-math.js
 * IIFE verbatim out of nova-casino.html (the exact same extractor sim/rtp-simulator.js
 * uses) and runs it in a real Node vm context, so every number below is measured
 * against the literal code the browser executes for a guest spin — not a hand-
 * copied approximation that could silently drift from the shipped game.
 *
 * Usage: node sim/shark-rtp-simulator.js [spins] [seed]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const NOVA_HTML = path.join(__dirname, '..', 'nova-casino.html');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadSharkMath() {
  const html = fs.readFileSync(NOVA_HTML, 'utf8');
  const startMarker = '/* js/game-math.js */';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) throw new Error('Canonical js/game-math.js module not found in nova-casino.html.');
  const endMarker = '\n})();\n';
  const endIdx = html.indexOf(endMarker, startIdx);
  if (endIdx === -1) throw new Error('End of js/game-math.js module not found.');
  const code = html.slice(startIdx, endIdx + endMarker.length);
  const cryptoShim = { getRandomValues: (arr) => crypto.webcrypto.getRandomValues(arr), randomUUID: () => crypto.randomUUID() };
  const sandbox = { window: {}, crypto: cryptoShim, console };
  vm.createContext(sandbox);
  vm.runInContext('this.globalThis = this;', sandbox);
  vm.runInContext(code, sandbox, { filename: 'game-math.extracted-shark.js' });
  if (!sandbox.window.__gameMath) throw new Error('Extraction incomplete — window.__gameMath was not set.');
  return sandbox.window.__gameMath;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

function run(N, SEED) {
  const M = loadSharkMath();
  const { generateSpin, nextFeatureState, STAKES_CENTS } = M;
  const STAKE = STAKES_CENTS[1]; // 20 cents, matches the app's default stake index
  const rng = mulberry32(SEED);

  let wagered = 0, won = 0, hits = 0;
  let baseLineWon = 0, mysteryWon = 0, razorWon = 0, freeGamesWon = 0;
  let bonusTriggers = 0;
  const bonusWins = [], cascadeSeqLengths = [], freeGamesLengths = [], endingMultipliers = [];

  for (let i = 0; i < N; i++) {
    const spin = generateSpin({ stakeCents: STAKE, isFreeSpin: false, multiplier: 1, rng });
    wagered += STAKE;
    const spinWon = spin.totalCents;
    if (spinWon > 0 || spin.freeSpins > 0) hits++;
    const hadCascade = spin.steps.some(s => s.type === 'reveal');
    if (hadCascade) cascadeSeqLengths.push(spin.steps.filter(s => s.type === 'winEval').length);
    const razorCents = spin.steps.filter(s => s.type === 'razorReveal').reduce((a, s) => a + s.addedCents, 0);
    razorWon += razorCents;
    if (hadCascade) mysteryWon += (spinWon - razorCents); else baseLineWon += spinWon;
    won += spinWon;

    if (spin.freeSpins > 0) {
      bonusTriggers++;
      let feature = nextFeatureState({ remaining: 0, multiplier: 2, stakeCents: STAKE, persistentStacks: [] }, spin);
      let fsWon = 0, fsPlayed = 0, guard = 0, peakMultiplier = feature.multiplier;
      while ((feature.remaining > 0 || feature.persistentStacks.length) && guard < 300) {
        guard++;
        // The multiplier actually applied to THIS spin is feature.multiplier as it
        // stands right now — nextFeatureState() resets it back to 2 once the whole
        // feature is over (a fresh baseline for the NEXT trigger), so the "ending
        // multiplier" statistic must be captured here, in-flight, not after the loop.
        peakMultiplier = Math.max(peakMultiplier, feature.multiplier);
        const isFirstFreeSpin = !feature.persistentStacks.length && fsPlayed === 0;
        const fsSpin = generateSpin({ stakeCents: STAKE, isFreeSpin: true, multiplier: feature.multiplier, persistentIn: feature.persistentStacks, forcedReels: isFirstFreeSpin ? [1, 3] : null, rng });
        fsWon += fsSpin.totalCents; fsPlayed++;
        feature = nextFeatureState(feature, fsSpin);
      }
      won += fsWon; freeGamesWon += fsWon;
      bonusWins.push(spinWon + fsWon);
      freeGamesLengths.push(fsPlayed);
      endingMultipliers.push(peakMultiplier);
    }
  }

  const lines = [];
  const p = (s) => lines.push(s);
  p('=== SHARK ABYSS v2 — RTP SIMULATION (math-only, no UI executed) ===');
  p(`spins: ${N}   seed: ${SEED}   stake: ${(STAKE / 100).toFixed(2)} EUR`);
  p('');
  p(`RTP (total): ${(100 * won / wagered).toFixed(3)}%`);
  p(`Hit frequency (any win or feature trigger): ${(100 * hits / N).toFixed(2)}%`);
  p('');
  p('--- RTP contribution breakdown ---');
  p(`Base-line RTP (no mystery stack involved): ${(100 * baseLineWon / wagered).toFixed(3)}%`);
  p(`Mystery-cascade RTP contribution (base game, excl. Razor Reveal prizes): ${(100 * mysteryWon / wagered).toFixed(3)}%`);
  p(`Razor Reveal RTP contribution: ${(100 * razorWon / wagered).toFixed(3)}%`);
  p(`Free Games RTP contribution: ${(100 * freeGamesWon / wagered).toFixed(3)}%`);
  p('');
  p('--- Bonus (Free Games) statistics ---');
  p(`Bonus frequency: 1 in ${(N / Math.max(1, bonusTriggers)).toFixed(0)} (${(100 * bonusTriggers / N).toFixed(3)}% of spins)`);
  p(`Average bonus win: ${mean(bonusWins).toFixed(0)} cents = ${(mean(bonusWins) / STAKE).toFixed(1)}x stake`);
  p(`Median bonus win: ${(percentile(bonusWins, 0.5) / STAKE).toFixed(1)}x stake`);
  p(`95th percentile bonus win: ${(percentile(bonusWins, 0.95) / STAKE).toFixed(1)}x stake`);
  p(`99th percentile bonus win: ${(percentile(bonusWins, 0.99) / STAKE).toFixed(1)}x stake`);
  p(`Max observed bonus win: ${(Math.max(0, ...bonusWins) / STAKE).toFixed(1)}x stake`);
  p(`Average Free Games length (spins played, incl. retriggers/extensions): ${mean(freeGamesLengths).toFixed(1)}`);
  p(`Average ending multiplier: ${mean(endingMultipliers).toFixed(2)}x`);
  p('');
  p('--- Mystery cascade statistics (base game) ---');
  p(`Average mystery-cascade sequence length (winEval cycles, when triggered): ${mean(cascadeSeqLengths).toFixed(2)}`);
  p(`Cascade frequency: ${(100 * cascadeSeqLengths.length / N).toFixed(2)}% of spins`);

  return { text: lines.join('\n'), rtp: 100 * won / wagered };
}

if (require.main === module) {
  const N = Number(process.argv[2] || 1000000);
  const SEED = Number(process.argv[3] || 90210);
  const { text } = run(N, SEED);
  console.log(text);
}
module.exports = { run, loadSharkMath };
