// Verifies the algae countdown fix: an algae cell must persist at its fixed board
// position across consecutive spins, decrementing by exactly 1 each spin, until it
// either reaches 0 (reveal) or becomes part of a win (early reveal) -- not vanish
// silently because the freshly-randomized symbol underneath happened to change (the bug).
const { chromium } = require('playwright');
const path = require('path');

async function waitSpinIdle(page, timeout = 8000) {
  await page.waitForFunction(() => {
    const btn = document.querySelector('#spinButton');
    return btn && !btn.classList.contains('busy');
  }, { timeout });
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

  // Seed 12 is known (scratchpad/find_seeds.js) to produce a mystery reveal (a fresh
  // algae cell) on the very first spin.
  await page.evaluate((s) => window.__novaTestHooks.setSeed(s), 12);
  await page.click('#spinButton', { force: true });
  await waitSpinIdle(page);
  await page.evaluate(() => window.__novaTestHooks.clearSeed());

  const readAlgae = () => page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('nova-casino-state-v2'));
      return s.algaeStates || {};
    } catch { return {}; }
  });

  let algae = await readAlgae();
  let keys = Object.keys(algae);
  results.push(['seed 12 seeded exactly one tracked algae cell', keys.length === 1]);
  if (keys.length !== 1) {
    console.log('unexpected algae state after seeding:', JSON.stringify(algae));
    await browser.close();
    console.log('\n=== ALGAE PERSISTENCE TEST ===');
    results.forEach(([n, p]) => console.log((p ? 'PASS' : 'FAIL') + '  ' + n));
    process.exit(1);
  }
  const trackedKey = keys[0];
  let remaining = algae[trackedKey].remaining;
  const startRemaining = remaining;
  console.log(`tracking algae at ${trackedKey}, starting remaining=${startRemaining}`);

  // Spin repeatedly with REAL randomness (not seeded) -- the whole point is that the
  // underlying grid symbol at that position will almost certainly change each time, and
  // the algae must survive that regardless, ticking down by exactly 1 per spin, until it
  // either disappears (revealed) or a win forces it to reveal early.
  let ticks = 0, revealedNaturally = false, revealedByWin = false, brokenSequence = false;
  for (let i = 0; i < startRemaining + 3 && !revealedNaturally && !revealedByWin; i++) {
    await page.click('#spinButton', { force: true });
    await waitSpinIdle(page);
    algae = await readAlgae();
    if (!(trackedKey in algae)) {
      // Either fully counted down and revealed, or absorbed into a win early -- both are
      // valid end states; distinguish via the toast/animation isn't reliable here, so
      // just confirm it disappeared at a sane point (not on spin 1, i.e. not the old bug).
      revealedNaturally = true;
      break;
    }
    const newRemaining = algae[trackedKey].remaining;
    ticks++;
    if (newRemaining !== remaining - 1) { brokenSequence = true; console.log(`  tick ${ticks}: remaining ${remaining} -> ${newRemaining} (expected ${remaining - 1})`); }
    remaining = newRemaining;
  }

  results.push(['algae ticked down by exactly 1 on every intermediate spin', !brokenSequence]);
  results.push(['algae survived at least one full extra spin before disappearing (not the old immediate-vanish bug)', ticks >= 1 || revealedNaturally === false]);
  results.push(['algae eventually disappeared (revealed) rather than living forever', revealedNaturally]);
  results.push(['zero console/page errors', consoleErrors.length === 0]);
  if (consoleErrors.length) consoleErrors.forEach((e) => console.log('  error:', e));

  await browser.close();
  console.log('\n=== ALGAE PERSISTENCE TEST ===');
  let allPass = true;
  for (const [name, pass] of results) { console.log((pass ? 'PASS' : 'FAIL') + '  ' + name); if (!pass) allPass = false; }
  process.exit(allPass ? 0 : 1);
})();
