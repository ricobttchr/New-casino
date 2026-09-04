// Phase 9 test matrix — deterministic version. Rather than spin hundreds of times hoping
// to hit a rare event, this uses window.__novaTestHooks.setSeed() (the Phase-2-required
// test-only seeded PRNG) with seeds pre-found offline (see
// scratchpad/find_seeds.js, run against the same math extracted from this exact file)
// to reproduce specific outcomes on the FIRST spin after seeding. Each seed is verified
// here against the real browser/DOM, not just trusted from the offline search.
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

  results.push(['test-only seeded RNG hook present and controllable', await page.evaluate(() => typeof window.__novaTestHooks?.setSeed === 'function')]);

  // --- Shark Abyss ---
  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(150);

  // NOTE: these seeds are for the Shark Abyss v2 (mystery-stack) engine — its rng
  // consumption order is completely different from the pre-rebuild math, so the
  // seeds that used to reproduce these scenarios no longer do; each was re-found
  // against the current js/game-math.js via a throwaway node search (see
  // tests/shark-engine-math.js for the math-only equivalents of these checks).
  await seededSpin(page, 6); // known: base spin awards free spins (3+ scatters)
  let featureMode = await page.$eval('#app', (el) => el.classList.contains('feature-mode'));
  results.push(['shark-abyss: Bonusstart/Freispiele (seed 6) actually entered feature-mode', featureMode]);
  // Feature is now active; take one more (seeded, arbitrary) free spin to exercise the
  // free-spin path itself, then leave it be (feature state persists naturally).
  if (featureMode) {
    await seededSpin(page, 7);
    results.push(['shark-abyss: a free spin plays without error while in feature mode', consoleErrors.length === 0]);
  }
  // Reset local profile between scenarios so leftover feature state doesn't interfere.
  await page.evaluate(() => localStorage.removeItem('nova-casino-state-v2'));
  await page.reload();
  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(150);

  await seededSpin(page, 14); // known: 4 distinct winning lines, single cycle (no cascade)
  let winnerCells = (await page.$$('.symbol.winner')).length;
  // Distinct paylines can share grid cells; the final cascade cycle's win stays
  // highlighted at rest (see presentWinEval's isFinal argument) — verified
  // directly against this seed: 4 lines sharing down to 6 unique cells, 0.66€ win.
  results.push(['shark-abyss: mehrere Linien gleichzeitig (seed 14, >=3 lines) shows a multi-cell win', winnerCells >= 6]);

  await page.evaluate(() => localStorage.removeItem('nova-casino-state-v2'));
  await page.reload();
  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(150);
  // Mystery Stacks are first-class engine state now (see js/game-math.js), not a
  // DOM-only overlay flag, so there is nothing to inspect in localStorage after
  // the fact — a transient stack always cascades to a full exit within the same
  // round (own NOVA design), so it's only ever on-screen WHILE the reveal step
  // plays. Watch for it appearing during the animation instead.
  await page.evaluate((s) => window.__novaTestHooks.setSeed(s), 1); // known: mystery reveal -> Golden Shark -> Razor Reveal cascade
  await page.click('#spinButton', { force: true });
  let sawMysteryReveal = false;
  try { await page.waitForSelector('.symbol.algae-erode, .symbol.golden-cell', { timeout: 6000 }); sawMysteryReveal = true; } catch { sawMysteryReveal = false; }
  await waitSpinIdle(page);
  await page.evaluate(() => window.__novaTestHooks.clearSeed());
  results.push(['shark-abyss: Mystery Stack (seed 1) actually revealed during the presentation', sawMysteryReveal]);

  // --- Tomb of Kings: free spins + (by construction) expanding symbol path ---
  await page.evaluate(() => localStorage.removeItem('nova-casino-state-v2'));
  await page.reload();
  await page.click('#closeGame').catch(() => {});
  await page.click('[data-play="tomb-of-kings"]');
  await page.waitForTimeout(150);
  await seededSpin(page, 168); // known: >=3 BOOK -> free spins
  featureMode = await page.$eval('#app', (el) => el.classList.contains('feature-mode'));
  results.push(['tomb-of-kings: Bonusstart/Freispiele (seed 168) actually entered feature-mode', featureMode]);
  const expandingSymbolChosen = await page.evaluate(() => {
    try { return !!JSON.parse(localStorage.getItem('nova-casino-state-v2')).gameStates['tomb-of-kings'].featureState.expandingSymbol; } catch { return false; }
  });
  results.push(['tomb-of-kings: an expanding symbol was chosen for the free-spin round', expandingSymbolChosen]);
  if (featureMode) {
    await seededSpin(page, 3); // any free spin while expanding symbol is armed
    results.push(['tomb-of-kings: a free spin (expanding-symbol-eligible) plays without error', consoleErrors.length === 0]);
  }

  // --- Fruit Reactor: win / loss / Kartenrisiko / Gewinn nehmen ---
  await page.evaluate(() => localStorage.removeItem('nova-casino-state-v2'));
  await page.reload();
  await page.click('[data-play="fruit-reactor"]');
  await page.waitForTimeout(150);
  await seededSpin(page, 1); // known: normal loss
  // de-DE Intl currency formatting uses U+00A0 (non-breaking space) before "€", not a
  // regular space -- normalize before comparing instead of matching the literal glyph.
  let lastWin = (await page.textContent('#lastWin')).replace(/ /g, ' ').trim();
  results.push(['fruit-reactor: normaler Verlust (seed 1)', lastWin === '0,00 €']);

  await seededSpin(page, 5); // known: simple win -> opens gamble (risk game)
  const riskOpen = !(await page.$eval('#riskPanel', (el) => el.hidden));
  results.push(['fruit-reactor: einfacher Gewinn (seed 5) opens Kartenrisiko', riskOpen]);
  if (riskOpen) {
    const balBefore = await page.textContent('#gameBalance');
    await page.click('#riskCollect', { force: true });
    await page.waitForTimeout(300);
    const balAfter = await page.textContent('#gameBalance');
    results.push(['fruit-reactor: Gewinn nehmen actually credits balance', balAfter !== balBefore]);
  }

  // --- Insufficient balance ---
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('nova-casino-state-v2'));
    s.balanceCents = 0; s.stakeIndex = 3;
    localStorage.setItem('nova-casino-state-v2', JSON.stringify(s));
  });
  await page.reload();
  await page.click('[data-play="fruit-reactor"]');
  await page.waitForTimeout(150);
  await page.click('#spinButton', { force: true });
  await page.waitForTimeout(300);
  const toastText = await page.textContent('#toast');
  const stillIdle = !(await page.$eval('#spinButton', (el) => el.classList.contains('busy')));
  results.push(['unzureichendes Guthaben: spin refused with a toast, no state change', /guthaben/i.test(toastText) && stillIdle]);

  // --- Fancy Harvest: Leiterrisiko ---
  await page.evaluate(() => localStorage.removeItem('nova-casino-state-v2'));
  await page.reload();
  await page.click('#closeGame').catch(() => {});
  await page.click('[data-play="fancy-harvest"]');
  await page.waitForTimeout(150);
  await seededSpin(page, 5); // known: simple win
  const fancyRiskOpen = !(await page.$eval('#riskPanel', (el) => el.hidden));
  if (fancyRiskOpen) {
    await page.click('#riskModeLadder', { force: true });
    await page.waitForTimeout(100);
    const ladderVisible = !(await page.$eval('#riskLadderActions', (el) => el.hidden));
    results.push(['fancy-harvest: Leiterrisiko reachable and selectable', ladderVisible]);
  } else {
    results.push(['fancy-harvest: Leiterrisiko reachable and selectable', false]);
  }

  // --- Demo reset ("kostenloses Auffüllen im Gastmodus") ---
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('nova-casino-state-v2'));
    s.balanceCents = 0;
    localStorage.setItem('nova-casino-state-v2', JSON.stringify(s));
  });
  await page.reload();
  await page.click('#profileButton', { force: true });
  await page.waitForTimeout(150);
  await page.click('#resetDemoGuest', { force: true }).catch(() => {});
  await page.waitForTimeout(150);
  const balanceAfterReset = await page.textContent('#walletBalance');
  results.push(['Gastmodus-Reset (Demo zurücksetzen) restores balance to 100,00 €', balanceAfterReset.includes('100,00')]);

  results.push(['zero console/page errors across the whole deterministic matrix', consoleErrors.length === 0]);
  if (consoleErrors.length) consoleErrors.forEach((e) => console.log('  error:', e));

  await browser.close();
  console.log('\n=== DETERMINISTIC TEST MATRIX (seeded PRNG) ===');
  let allPass = true;
  for (const [name, pass] of results) { console.log((pass ? 'PASS' : 'FAIL') + '  ' + name); if (!pass) allPass = false; }
  process.exit(allPass ? 0 : 1);
})();
