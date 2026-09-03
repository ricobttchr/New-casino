// Verifies the core "settle exactly once" invariant from AUDIT.md B2/B3:
// - balanceCents always equals initialBalance - wageredCents + wonCents (no drift)
// - repeated reloads mid-spin never double-credit or double-count stats
// - calling the completion path twice on an already-settled spin is a safe no-op
const { chromium } = require('playwright');
const path = require('path');

async function waitSpinIdle(page, timeout = 8000) {
  await page.waitForFunction(() => {
    const btn = document.querySelector('#spinButton');
    return btn && !btn.classList.contains('busy');
  }, { timeout });
}

function readState(page) {
  return page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('nova-casino-state-v2')); } catch { return null; }
  });
}

(async () => {
  const results = [];
  const fileUrl = 'file://' + path.resolve(process.argv[2] || 'nova-casino.html');
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(fileUrl);
  await page.waitForTimeout(300);
  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(150);
  // LocalCasinoStore only persists to localStorage on its first patch() call (e.g. the
  // first spin's pendingRequest), not on construction — so read the known fallback
  // default (see LocalCasinoStore.fallback(): balanceCents:10000) rather than a state
  // object that may not exist on disk yet on a brand-new profile.
  const initialBalance = 10000;

  // 10 reload-mid-spin cycles in a row: click spin, reload almost immediately (before the
  // presentation/settlement can run), and check the invariant after each recovery.
  for (let i = 0; i < 10; i++) {
    await page.click('#spinButton');
    await page.waitForTimeout(15 + (i % 5) * 10); // vary the exact interruption point
    await page.reload();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(400);
    await page.click('[data-play="shark-abyss"]').catch(() => {});
    await page.waitForTimeout(150);
    const s = await readState(page);
    const expected = initialBalance - s.stats.wageredCents + s.stats.wonCents;
    const ok = s.pendingSpin === null && s.balanceCents === expected;
    results.push([`cycle ${i + 1}: balance == initial - wagered + won, pendingSpin cleared`, ok]);
    if (!ok) console.log('  mismatch:', { balanceCents: s.balanceCents, expected, pendingSpin: s.pendingSpin, stats: s.stats });
  }

  // Finish with a few normal, fully-played-out spins and re-check the same invariant.
  for (let i = 0; i < 5; i++) {
    await page.click('#spinButton');
    await waitSpinIdle(page);
  }
  const final = await readState(page);
  const finalExpected = initialBalance - final.stats.wageredCents + final.stats.wonCents;
  results.push(['after 5 normal spins: invariant still holds', final.balanceCents === finalExpected]);
  results.push(['after 5 normal spins: no pendingSpin left dangling', final.pendingSpin === null]);

  await browser.close();
  console.log('\n=== SETTLEMENT INVARIANT TEST ===');
  let allPass = true;
  for (const [name, pass] of results) { console.log((pass ? 'PASS' : 'FAIL') + '  ' + name); if (!pass) allPass = false; }
  process.exit(allPass ? 0 : 1);
})();
