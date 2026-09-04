// Verifies the algae mechanic precisely as specified by the product owner: an algae
// band is a single contiguous vertical run of cells in one reel column (2-4 rows,
// however many createGrid()'s mystery math produced this spin). It must NOT behave as
// independent per-cell countdowns (the earlier, wrong implementation) -- it must erode
// exactly ONE row per spin, always from the TOP of the band downward, until every row
// in the band has been revealed. E.g. a 4-row band covering rows 0-3 shows all 4 rows
// covered the spin it appears, then row 0 clears, then row 1, then row 2, then row 3
// (band gone) -- never a random row, never more than one row per spin.
//
// This uses a fully deterministic 4-seed sequence (found via
// scratchpad/find-algae-sequence.js against the exact math extracted from this file)
// rather than real randomness for the follow-up spins, so the entire multi-step
// erosion is verified end to end on every run instead of only "until a real-RNG win
// happens to interrupt it" (a win landing on a still-covered row is a real, documented
// exception -- forceCompleteSpin-style early full reveal -- but it must not be the
// only thing this test happens to exercise).
const { chromium } = require('playwright');
const path = require('path');

async function waitSpinIdle(page, timeout = 8000) {
  await page.waitForFunction(() => {
    const btn = document.querySelector('#spinButton');
    return btn && !btn.classList.contains('busy');
  }, { timeout });
}

async function seededSpin(page, seed) {
  await page.evaluate((s) => window.__novaTestHooks.setSeed(s), seed);
  await page.click('#spinButton', { force: true });
  await waitSpinIdle(page);
  await page.evaluate(() => window.__novaTestHooks.clearSeed());
}

(async () => {
  const results = [];
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto('file://' + path.resolve(process.argv[2] || 'nova-casino.html'));
  await page.waitForTimeout(300);
  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(150);

  const readBand = () => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('nova-casino-state-v2')).algaeBand || null; } catch { return null; }
  });
  const readCoveredRows = (col) => page.evaluate((c) =>
    [...document.querySelectorAll('.symbol.algae')]
      .map((el) => el.dataset.cell)
      .filter((key) => key.startsWith(`${c}-`))
      .map((key) => Number(key.split('-')[1]))
      .sort((a, b) => a - b)
  , col);
  // row -> displayed countdown number (data-remaining), so the badge itself is
  // checked, not just which cells are covered -- catches a real bug found by eye
  // during manual verification, where the topmost (soonest-to-reveal) row showed
  // the HIGHEST number instead of the lowest.
  const readRemainingByRow = (col) => page.evaluate((c) => {
    const out = {};
    document.querySelectorAll('.symbol.algae').forEach((el) => {
      if (el.dataset.cell.startsWith(`${c}-`)) out[el.dataset.cell.split('-')[1]] = Number(el.dataset.remaining);
    });
    return out;
  }, col);

  // Seed 24: fresh 4-row band, column 1, rows 0-3, zero winning cells.
  await seededSpin(page, 24);
  let band = await readBand();
  results.push(['seed 24 seeded exactly one active band', !!band]);
  if (!band) {
    console.log('no algae band after seeding — aborting');
    await browser.close();
    console.log('\n=== ALGAE PERSISTENCE TEST ===');
    results.forEach(([n, p]) => console.log((p ? 'PASS' : 'FAIL') + '  ' + n));
    process.exit(1);
  }
  const col = band.col;
  results.push(['band spans exactly rows 0-3 (full 4-row column)', JSON.stringify(band.rows) === '[0,1,2,3]']);
  results.push(['band starts with revealedCount=0 (all 4 rows covered on the seeding spin)', band.revealedCount === 0]);
  let covered = await readCoveredRows(col);
  results.push(['all 4 rows visibly covered right after seeding: "4 von 4"', JSON.stringify(covered) === '[0,1,2,3]']);
  let remainingByRow = await readRemainingByRow(col);
  results.push(['countdown badges count UP from the top (row0=1, row1=2, row2=3, row3=4) -- the topmost row reveals soonest', JSON.stringify(remainingByRow) === JSON.stringify({ '0': 1, '1': 2, '2': 3, '3': 4 })]);

  // Deterministic follow-up seeds (scratchpad/find-algae-sequence.js): none of these
  // spins produce a win on the then-still-covered rows, so the erosion proceeds
  // exactly one row at a time with no early-reveal exception firing.
  const FOLLOWUP_SEEDS = [1, 1, 1];
  const expectedCoveredAfterStep = [[1, 2, 3], [2, 3], [3]];
  const expectedRemainingAfterStep = [{ '1': 1, '2': 2, '3': 3 }, { '2': 1, '3': 2 }, { '3': 1 }];

  for (let i = 0; i < FOLLOWUP_SEEDS.length; i++) {
    await seededSpin(page, FOLLOWUP_SEEDS[i]);
    band = await readBand();
    covered = await readCoveredRows(col);
    remainingByRow = await readRemainingByRow(col);
    results.push([`step ${i + 1}: revealedCount is ${i + 1} (advances by exactly 1)`, band?.revealedCount === i + 1]);
    results.push([`step ${i + 1}: covered rows are exactly [${expectedCoveredAfterStep[i]}] -- row ${i} cleared from the TOP, nothing else changed`, JSON.stringify(covered) === JSON.stringify(expectedCoveredAfterStep[i])]);
    results.push([`step ${i + 1}: countdown badges are ${JSON.stringify(expectedRemainingAfterStep[i])} (each remaining row's own countdown, not the old inverted values)`, JSON.stringify(remainingByRow) === JSON.stringify(expectedRemainingAfterStep[i])]);
  }

  // Final spin: the last remaining row (3) clears and the band is gone entirely.
  await seededSpin(page, 1);
  band = await readBand();
  covered = await readCoveredRows(col);
  results.push(['band is null after the 4th total spin (all rows revealed)', band === null]);
  results.push(['no cells remain visually covered in that column', covered.length === 0]);

  results.push(['zero console/page errors', consoleErrors.length === 0]);
  if (consoleErrors.length) consoleErrors.forEach((e) => console.log('  error:', e));

  await browser.close();
  console.log('\n=== ALGAE PERSISTENCE TEST ===');
  let allPass = true;
  for (const [name, pass] of results) { console.log((pass ? 'PASS' : 'FAIL') + '  ' + name); if (!pass) allPass = false; }
  process.exit(allPass ? 0 : 1);
})();
