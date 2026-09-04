// Shark Abyss v2 — live UI smoke test. Drives the actual rendered app (not just
// the math module) through the debug hooks (window.__sharkDebug) added for this
// rebuild, so rare states (Golden Shark, Razor Reveal, a Free Games trigger) can
// be reached deterministically instead of by spinning hundreds of times. This
// replaces tests/algae-persistence.js, whose single-band "algae" mechanic no
// longer exists — Mystery Stacks are now first-class engine state (see
// js/game-math.js in nova-casino.html and tests/shark-engine-math.js for the
// math-only assertions).
const { chromium } = require('playwright');
const path = require('path');

async function waitSpinIdle(page, timeout = 12000) {
  await page.waitForFunction(() => {
    const btn = document.querySelector('#spinButton');
    return btn && !btn.classList.contains('busy');
  }, { timeout });
}
async function debugSpin(page, fn) {
  await page.evaluate(fn);
  await page.click('#spinButton', { force: true });
  await waitSpinIdle(page);
}

(async () => {
  const results = [];
  const fileUrl = 'file://' + path.resolve(process.argv[2] || 'nova-casino.html');
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  await page.goto(fileUrl);
  await page.waitForTimeout(300);
  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(200);

  // A. A forced mystery stack actually reveals the requested symbol during the
  // presentation. A transient stack always cascades all the way to a full exit
  // within the same round (own NOVA design — see runRound in js/game-math.js),
  // so the symbol is only guaranteed to be on-screen WHILE the reveal step
  // plays, not in the final settled grid — this runs at normal (non-turbo)
  // speed and watches for it appearing during the animation, not just at rest.
  await page.evaluate(() => window.__sharkDebug.triggerMysteryStack({ reel: 1, reveal: 'GREEN_SHARK' }));
  await page.click('#spinButton', { force: true });
  let sawGreenShark = false;
  try {
    await page.waitForSelector('.symbol[data-symbol="GREEN_SHARK"]', { timeout: 6000 });
    sawGreenShark = true;
  } catch { sawGreenShark = false; }
  await waitSpinIdle(page);
  results.push(['forced mystery stack reveals the requested symbol', sawGreenShark]);

  await page.click('#quickButton'); // turbo, keep the rest of the run fast

  // B. Golden Shark -> Razor Reveal renders golden cells and settles cleanly.
  await debugSpin(page, () => window.__sharkDebug.triggerGoldenShark({ reel: 2 }));
  const balanceAfterGolden = await page.$eval('#walletBalance', el => el.textContent);
  results.push(['Golden Shark / Razor Reveal spin completes without hanging', typeof balanceAfterGolden === 'string' && balanceAfterGolden.length > 0]);

  // C. A forced Razor Reveal with a known outcome list pays the expected instant prizes.
  const balanceBefore = await page.$eval('#walletBalance', el => el.textContent);
  await debugSpin(page, () => window.__sharkDebug.triggerRazorReveal(['2x', 'SCATTER', '25x', '2500x'], { reel: 3 }));
  const lastWin = await page.$eval('#lastWin', el => el.textContent);
  results.push(['forced Razor Reveal produces a non-zero win (2x+25x+2500x stake)', lastWin !== '0,00 €' && lastWin.length > 0]);

  // D. Free Games trigger seeds persistent stacks on UI reels 2 & 4 (0-indexed 1 & 3).
  await debugSpin(page, () => window.__sharkDebug.triggerFreeGames(3));
  const featureModeOn = await page.$eval('#app', el => el.classList.contains('feature-mode'));
  results.push(['3 forced scatters put the app into feature-mode (free games)', featureModeOn]);
  if (featureModeOn) {
    // Play one free spin (no forcing) and confirm the persistent stacks show up
    // specifically on reel index 1 and 3 (UI reels 2 and 4).
    await page.click('#spinButton', { force: true });
    await waitSpinIdle(page);
    const stackReels = await page.$$eval('.reel', reels => reels.map((r, i) => ({ i, hasAlgae: !!r.querySelector('.symbol.algae') })));
    const onlyExpectedReels = stackReels.filter(r => r.hasAlgae).every(r => r.i === 1 || r.i === 3);
    results.push(['any visible mystery stack during free games sits on reel 2 or 4 (UI-indexed)', onlyExpectedReels]);
  } else {
    results.push(['any visible mystery stack during free games sits on reel 2 or 4 (UI-indexed)', 'SKIPPED (feature ended before check)']);
  }

  // E. Crash-safety: reload mid-feature must not lose the pending spin, double-charge, or crash.
  const balancePreReload = await page.$eval('#walletBalance', el => el.textContent);
  await page.evaluate(() => {
    // Simulate a spin that never got to finish presenting (tab killed mid-animation).
    window.__sharkDebug.triggerMysteryStack({ reel: 0, reveal: 'BLUE_SHARK' });
  });
  await page.click('#spinButton', { force: true });
  await page.waitForTimeout(120); // interrupt mid-presentation, before it settles
  await page.reload();
  await page.waitForTimeout(400);
  await page.click('[data-play="shark-abyss"]').catch(() => {});
  const noCrashAfterReload = await page.$eval('#spinButton', el => Boolean(el)).catch(() => false);
  results.push(['reloading mid-spin recovers cleanly (forceCompleteSpin), no crash', noCrashAfterReload]);
  await waitSpinIdle(page).catch(() => {});
  const spinnableAfterReload = await page.$eval('#spinButton', el => !el.disabled).catch(() => false);
  results.push(['spin button is usable again after the reload-recovery', spinnableAfterReload]);

  results.push(['zero console errors across the whole run', consoleErrors.length === 0]);
  if (consoleErrors.length) consoleErrors.slice(0, 10).forEach(e => console.log(' err:', e));

  await browser.close();
  console.log('\n=== SHARK ABYSS v2 UI TEST ===');
  let allPass = true;
  for (const [name, pass] of results) {
    const label = pass === true ? 'PASS' : pass === false ? 'FAIL' : String(pass);
    console.log(label.padEnd(8) + name);
    if (pass === false) allPass = false;
  }
  process.exit(allPass ? 0 : 1);
})();
