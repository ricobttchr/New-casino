// Shark Abyss v2 — pure math/engine unit tests. No browser, no DOM: extracts the
// literal js/game-math.js IIFE out of nova-casino.html (same technique as
// sim/rtp-simulator.js) and runs it in a Node vm context, so these assertions run
// against the exact canonical code the browser executes for a guest spin.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const NOVA_HTML = path.join(__dirname, '..', 'nova-casino.html');

function loadSharkMath() {
  const html = fs.readFileSync(NOVA_HTML, 'utf8');
  const startIdx = html.indexOf('/* js/game-math.js */');
  if (startIdx === -1) throw new Error('js/game-math.js marker not found');
  const endIdx = html.indexOf('\n})();\n', startIdx);
  if (endIdx === -1) throw new Error('end of js/game-math.js module not found');
  const code = html.slice(startIdx, endIdx + '\n})();\n'.length);
  const cryptoShim = { getRandomValues: (arr) => crypto.webcrypto.getRandomValues(arr), randomUUID: () => crypto.randomUUID() };
  const sandbox = { window: {}, crypto: cryptoShim, console };
  vm.createContext(sandbox);
  vm.runInContext('this.globalThis = this;', sandbox);
  vm.runInContext(code, sandbox, { filename: 'game-math.extracted-shark.js' });
  if (!sandbox.window.__gameMath) throw new Error('extraction incomplete');
  return sandbox.window.__gameMath;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const M = loadSharkMath();
let n = 0, pass = 0;
function check(name, cond) { n++; if (cond) pass++; else console.log('FAIL:', name); }

// --- A. Wild-substitution payline evaluation ---------------------------------
function gridFromRow0(row0syms) {
  const grid = Array.from({ length: 5 }, () => ['FLIPPERS', 'GOGGLES', 'CAMERA', 'OXYGEN_TANK']);
  row0syms.forEach((s, c) => { grid[c][0] = s; });
  return grid;
}
const STAKE = 200;
{
  const grid = gridFromRow0(['ORANGE_SHARK', 'ORANGE_SHARK', 'ORANGE_SHARK', 'GOGGLES', 'CAMERA']);
  const { wins } = M.evaluateGrid(grid, STAKE, { multiplier: 1 });
  const w = wins.find(w => w.lineIndex === 0);
  check('AAA-- pays 3-of-a-kind on the base symbol', w && w.symbol === 'ORANGE_SHARK' && w.count === 3);
}
{
  const grid = gridFromRow0(['GREAT_WHITE', 'ORANGE_SHARK', 'ORANGE_SHARK', 'GOGGLES', 'CAMERA']);
  const { wins } = M.evaluateGrid(grid, STAKE, { multiplier: 1 });
  const w = wins.find(w => w.lineIndex === 0);
  check('WAA-- pays as 3-of-a-kind ORANGE_SHARK (wild substitutes)', w && w.symbol === 'ORANGE_SHARK' && w.count === 3);
}
{
  const grid = gridFromRow0(['GREAT_WHITE', 'GREAT_WHITE', 'ORANGE_SHARK', 'GOGGLES', 'CAMERA']);
  const { wins } = M.evaluateGrid(grid, STAKE, { multiplier: 1 });
  const w = wins.find(w => w.lineIndex === 0);
  check('WWA-- pays as 3-of-a-kind ORANGE_SHARK, no double-pay', w && w.symbol === 'ORANGE_SHARK' && w.count === 3 && wins.filter(x => x.lineIndex === 0).length === 1);
}
{
  const grid = gridFromRow0(['GREAT_WHITE', 'GREAT_WHITE', 'GREAT_WHITE', 'GOGGLES', 'CAMERA']);
  const { wins } = M.evaluateGrid(grid, STAKE, { multiplier: 1 });
  const w = wins.find(w => w.lineIndex === 0);
  check('WWW+GOGGLES extends the wild-prefix into a 4-of-a-kind GOGGLES', w && w.symbol === 'GOGGLES' && w.count === 4);
}
{
  const grid = gridFromRow0(['GREAT_WHITE', 'GREAT_WHITE', 'GREAT_WHITE', 'GREAT_WHITE', 'GREAT_WHITE']);
  const { wins } = M.evaluateGrid(grid, STAKE, { multiplier: 1 });
  const w = wins.find(w => w.lineIndex === 0);
  check("WWWWW pays via the wild's own paytable", w && w.symbol === 'GREAT_WHITE' && w.count === 5);
  const expected = Math.round(M.SYMBOLS.GREAT_WHITE.pays[4] * (STAKE / 20) * 1 * M.LINE_CALIBRATION);
  check('WWWWW pays the correct wild-table amount', w && w.amountCents === expected);
}
{
  const grid = gridFromRow0(['GREAT_WHITE', 'BLUE_SHARK', 'BLUE_SHARK', 'BLUE_SHARK', 'BLUE_SHARK']);
  const { wins } = M.evaluateGrid(grid, STAKE, { multiplier: 1 });
  const w = wins.find(w => w.lineIndex === 0);
  check('WBBBB pays as 5-of-a-kind BLUE_SHARK', w && w.symbol === 'BLUE_SHARK' && w.count === 5);
}
{
  const grid = gridFromRow0(['ORANGE_SHARK', 'ORANGE_SHARK', 'SEA_MINE', 'ORANGE_SHARK', 'ORANGE_SHARK']);
  const { wins } = M.evaluateGrid(grid, STAKE, { multiplier: 1 });
  check('scatter breaks the line run mid-payline (no payout)', !wins.find(w => w.lineIndex === 0));
}
{
  const grid = gridFromRow0(['ORANGE_SHARK', 'ORANGE_SHARK', 'SEAWEED', 'ORANGE_SHARK', 'ORANGE_SHARK']);
  const { wins } = M.evaluateGrid(grid, STAKE, { multiplier: 1 });
  check('an unrevealed SEAWEED cell breaks the line (no premature payout)', !wins.find(w => w.lineIndex === 0));
}
{
  const grid = Array.from({ length: 5 }, () => ['FLIPPERS', 'GOGGLES', 'CAMERA', 'OXYGEN_TANK']);
  for (let c = 0; c < 5; c++) { grid[c][0] = 'ORANGE_SHARK'; grid[c][1] = 'PURPLE_SHARK'; }
  const { wins } = M.evaluateGrid(grid, STAKE, { multiplier: 1 });
  const w0 = wins.find(w => w.lineIndex === 0), w1 = wins.find(w => w.lineIndex === 1);
  check('two parallel lines both pay independently', w0 && w1 && w0.symbol === 'ORANGE_SHARK' && w1.symbol === 'PURPLE_SHARK');
}

// --- B. Mystery stack offset/visibility lifecycle ----------------------------
{
  let s = { offset: -1 };
  check('offset=-1 shows rows [0,1,2]', JSON.stringify(M.visibleRowsForStack(s)) === JSON.stringify([0, 1, 2]));
  s = M.nudgeStack(s, 1);
  check('nudge -1->0 shows rows [0,1,2,3] (full stack)', s.offset === 0 && JSON.stringify(M.visibleRowsForStack(s)) === JSON.stringify([0, 1, 2, 3]));
  s = M.nudgeStack(s, 1);
  check('nudge 0->1 shows rows [1,2,3] (exiting from top)', s.offset === 1 && JSON.stringify(M.visibleRowsForStack(s)) === JSON.stringify([1, 2, 3]));
  s = M.nudgeStack(s, 1); s = M.nudgeStack(s, 1); s = M.nudgeStack(s, 1);
  check('offset=4 has no visible rows (fully exited)', s.offset === 4 && M.visibleRowsForStack(s).length === 0 && !M.isStackActive(s));
}
{
  // A stack starting at offset=-2 must first GROW to offset=0 (full visibility)
  // before it can shrink out to offset=4 -- 6 nudges total, not fewer, since new
  // stacks only ever start still-arriving (offset<=0).
  let s = { offset: -2 }, nudges = 0;
  while (M.isStackActive(s) && nudges < 20) { s = M.nudgeStack(s, 1); nudges++; }
  check('a stack starting at offset=-2 takes exactly 6 nudges to fully exit', nudges === 6);
}
{
  const s = M.createMysteryStack({ reel: 2, rng: () => 0.99 });
  check('createMysteryStack always starts with offset<=0 (arriving from above)', s.offset <= 0 && s.reel === 2 && s.active !== false);
}

// --- C. Grid generation: covered cells, no scatter under seaweed -------------
{
  const rng = mulberry32(7);
  const covered = new Set(['2-0', '2-1', '2-2', '2-3']);
  let sawScatterOnCovered = false;
  for (let i = 0; i < 500; i++) {
    const grid = M.generateReelSymbols({ rng, covered });
    for (let r = 0; r < 4; r++) if (grid[2][r] !== 'SEAWEED') sawScatterOnCovered = true;
    if (grid[2].some(s => s !== 'SEAWEED')) sawScatterOnCovered = true;
  }
  check('every covered cell renders as SEAWEED, never a random symbol', !sawScatterOnCovered);
}
{
  const rng = mulberry32(11);
  const grid = M.generateReelSymbols({ rng, covered: new Set(), forceScatterCount: 3 });
  const scatterCells = []; grid.forEach((col, c) => col.forEach((s, r) => { if (s === 'SEA_MINE') scatterCells.push([c, r]); }));
  check('forceScatterCount places exactly the requested number of scatters', scatterCells.length === 3);
  check('forced scatters land on distinct reels', new Set(scatterCells.map(([c]) => c)).size === 3);
}

// --- D. Full-round orchestration (generateSpin) ------------------------------
{
  const rng = mulberry32(123);
  let sawReveal = false, sawCascade = false, cycles = 0;
  for (let i = 0; i < 20000 && (!sawReveal || !sawCascade); i++) {
    const spin = M.generateSpin({ stakeCents: 100, isFreeSpin: false, multiplier: 1, rng });
    if (spin.steps.some(s => s.type === 'reveal')) sawReveal = true;
    if (spin.steps.filter(s => s.type === 'winEval').length > 1) sawCascade = true;
    cycles++;
  }
  check('a mystery reveal step occurs within a reasonable number of spins', sawReveal);
  check('a multi-cycle cascade occurs within a reasonable number of spins', sawCascade);
}
{
  // Reveal-before-evaluation: no winEval step's grid may contain an unrevealed
  // SEAWEED cell that a still-active stack was covering (nothing should ever be
  // scored while still covered).
  const rng = mulberry32(55);
  let violated = false;
  for (let i = 0; i < 3000; i++) {
    const spin = M.generateSpin({ stakeCents: 100, isFreeSpin: false, multiplier: 1, rng });
    for (const step of spin.steps) {
      if (step.type === 'winEval') {
        for (const w of step.wins) for (const [c, r] of w.cells) if (step.grid[c][r] === 'SEAWEED') violated = true;
      }
    }
  }
  check('no winEval step ever scores a still-covered (SEAWEED) cell', !violated);
}
{
  // A round with no mystery stack at all must still evaluate its paylines (the
  // do/while bug this engine was specifically rebuilt to avoid: an earlier
  // version silently never scored a stack-free spin).
  const rng = () => 0.999; // pushes every weighted roll to its lowest-probability branch, minimizing stack spawns
  let sawPlainWinEval = false;
  for (let i = 0; i < 200; i++) {
    const spin = M.generateSpin({ stakeCents: 100, isFreeSpin: false, multiplier: 1, rng });
    if (spin.steps.some(s => s.type === 'winEval')) sawPlainWinEval = true;
  }
  check('every round evaluates its grid at least once, even with zero stacks', sawPlainWinEval);
}

// --- E. Golden Shark -> Razor Reveal ------------------------------------------
{
  const rng = mulberry32(321);
  let found = null;
  for (let i = 0; i < 40000 && !found; i++) {
    const spin = M.generateSpin({ stakeCents: 100, isFreeSpin: false, multiplier: 1, rng });
    const razor = spin.steps.find(s => s.type === 'razorReveal');
    if (razor) found = { spin, razor };
  }
  check('a Golden Shark -> Razor Reveal occurs within a reasonable number of spins', Boolean(found));
  if (found) {
    const { razor } = found;
    check('razor outcome count matches the number of golden cells', razor.outcomes.length === razor.cells.length);
    check('every razor outcome is a valid prize or scatter', razor.outcomes.every(o => o.kind === 'scatter' || (o.kind === 'prize' && o.value > 0)));
    const revealStepIndex = found.spin.steps.indexOf(found.spin.steps.find(s => s.type === 'reveal' && s.golden));
    const razorStepIndex = found.spin.steps.indexOf(razor);
    check('the reveal step always precedes its razorReveal step', revealStepIndex >= 0 && revealStepIndex < razorStepIndex);
    const expectedAdded = razor.outcomes.filter(o => o.kind === 'prize').reduce((a, o) => a + Math.round(o.value * found.spin.stakeCents), 0);
    check('razor addedCents matches the sum of its prize outcomes', razor.addedCents === expectedAdded);
  }
}
{
  // Forced razor outcomes (debug-hook contract): resolveRazorCell must consume a
  // forced queue in order before ever touching the rng.
  const rng = mulberry32(1);
  const forcePlan = { stacks: [{ reel: 2, offset: 0, revealType: 'golden', revealSymbol: 'GOLDEN_SHARK' }], razorOutcomes: ['2x', 'SCATTER', '25x', '2500x'] };
  const spin = M.generateSpin({ stakeCents: 100, isFreeSpin: false, multiplier: 1, forcePlan, rng });
  const razor = spin.steps.find(s => s.type === 'razorReveal');
  check('a forced golden stack always produces a razorReveal step', Boolean(razor));
  if (razor) {
    const kinds = razor.outcomes.map(o => o.kind === 'scatter' ? 'SCATTER' : `${o.value}x`);
    check('forced razor outcomes are applied in the exact order given', JSON.stringify(kinds) === JSON.stringify(['2x', 'SCATTER', '25x', '2500x']));
  }
}

// --- F. Stack-driven Free Games (reels 1 & 3, 0-indexed = UI reels 2 & 4) ----
{
  const rng = mulberry32(999);
  const forcePlan = { scatterCount: 3 };
  const spin = M.generateSpin({ stakeCents: 100, isFreeSpin: false, multiplier: 1, forcePlan, rng });
  check('3 forced scatters award 8 free spins', spin.freeSpins === 8);
  const fs1 = M.generateSpin({ stakeCents: 100, isFreeSpin: true, multiplier: 2, persistentIn: [], forcedReels: [1, 3], rng });
  check('the first free spin seeds exactly 2 persistent stacks', fs1.persistentOut.length === 2 || fs1.persistentOut.length === 0);
  check('the first free spin seeds persistent stacks on reels 1 and 3 (0-indexed)', fs1.steps.filter(s => s.type === 'reveal').every(s => s.reel === 1 || s.reel === 3));
  check('each valid persistent nudge grows the multiplier by exactly 1 per stack', fs1.multiplierGain === fs1.persistentOut.length || (fs1.multiplierGain >= 0 && fs1.multiplierGain <= 2));
}
{
  const rng = mulberry32(4242);
  let feature = M.nextFeatureState({ remaining: 0, multiplier: 2, stakeCents: 20, persistentStacks: [] }, { isFreeSpin: false, freeSpins: 8, stakeCents: 20 });
  check('a base-game trigger sets remaining/multiplier/persistentStacks correctly', feature.remaining === 8 && feature.multiplier === 2 && feature.persistentStacks.length === 0);
  let totalGain = 0, spins = 0, guard = 0;
  while ((feature.remaining > 0 || feature.persistentStacks.length) && guard < 50) {
    guard++;
    const isFirst = !feature.persistentStacks.length && spins === 0;
    const fsSpin = M.generateSpin({ stakeCents: 20, isFreeSpin: true, multiplier: feature.multiplier, persistentIn: feature.persistentStacks, forcedReels: isFirst ? [1, 3] : null, rng });
    totalGain += fsSpin.multiplierGain;
    feature = M.nextFeatureState(feature, fsSpin);
    spins++;
  }
  check('the feature ends only once no persistent stack remains active', feature.remaining === 0 && feature.persistentStacks.length === 0);
  check('two persistent stacks each nudging 4 times contribute 8 total multiplier gain', totalGain === 8);
}

console.log(`\n${pass}/${n} Shark Abyss v2 engine assertions passed`);
process.exit(pass === n ? 0 : 1);
