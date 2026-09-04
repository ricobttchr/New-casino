const { chromium } = require('playwright');
const path = require('path');

async function waitSpinIdle(page, timeout = 8000) {
  await page.waitForFunction(() => {
    const btn = document.querySelector('#spinButton');
    return btn && !btn.classList.contains('busy');
  }, { timeout });
}

(async () => {
  const fileUrl = 'file://' + path.resolve(process.argv[2] || 'nova-casino.html');
  const SPINS_PER_GAME = Number(process.argv[3] || 125);
  const games = ['shark-abyss', 'fruit-reactor', 'fancy-harvest', 'tomb-of-kings'];
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  await page.goto(fileUrl);
  await page.waitForTimeout(300);
  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(150);
  await page.click('#quickButton'); // turbo, to get through many spins quickly
  await page.click('#closeGame');
  await page.waitForTimeout(150);

  const domCountStart = await page.evaluate(() => document.querySelectorAll('*').length);
  const listenerLeakProbe = await page.evaluate(() => { window.__setTimeoutCalls = 0; const orig = window.setTimeout; window.setTimeout = (...a) => { window.__setTimeoutCalls++; return orig(...a); }; return true; });

  let totalSpins = 0, negativeBalanceSeen = false, stuckCount = 0;
  for (const game of games) {
    await page.click('#closeGame').catch(() => {});
    await page.waitForTimeout(100);
    await page.click('[data-play="' + game + '"]');
    await page.waitForTimeout(150);
    for (let i = 0; i < SPINS_PER_GAME; i++) {
      // If a gamble round is open, resolve it (alternate collect/risk) before spinning again.
      const gambleOpen = !(await page.$eval('#riskPanel', el => el.hidden).catch(() => true));
      if (gambleOpen) {
        if (i % 2 === 0) await page.click('#riskCollect').catch(() => {});
        else await page.click('#riskRed').catch(() => {});
        await page.waitForTimeout(150);
        continue;
      }
      const disabled = await page.$eval('#spinButton', el => el.disabled).catch(() => true);
      if (disabled) { await page.waitForTimeout(50); continue; }
      await page.click('#spinButton').catch(() => {});
      try {
        await waitSpinIdle(page, 6000);
      } catch {
        stuckCount++;
      }
      totalSpins++;
      const balCents = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('nova-casino-state-v2')).balanceCents; } catch { return null; }
      });
      if (balCents !== null && balCents < 0) negativeBalanceSeen = true;
    }
  }

  const domCountEnd = await page.evaluate(() => document.querySelectorAll('*').length);
  const finalStats = await page.evaluate(() => {
    try { const s = JSON.parse(localStorage.getItem('nova-casino-state-v2')); return s.stats; } catch { return null; }
  });
  const finalPendingSpin = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('nova-casino-state-v2')).pendingSpin; } catch { return 'ERR'; }
  });

  await browser.close();

  console.log('=== SOAK TEST (', games.length * SPINS_PER_GAME, 'attempted spins across', games.length, 'games ) ===');
  console.log('Actual completed spins (state-machine settled):', totalSpins);
  console.log('Stuck/timeout occurrences (animation watchdog should prevent this):', stuckCount);
  console.log('Negative balance ever observed:', negativeBalanceSeen);
  console.log('DOM node count start -> end:', domCountStart, '->', domCountEnd, ' (delta ' + (domCountEnd - domCountStart) + ')');
  console.log('Final stats object:', JSON.stringify(finalStats));
  console.log('Final pendingSpin (should be null = fully settled):', JSON.stringify(finalPendingSpin));
  console.log('Console/page errors during soak:', consoleErrors.length);
  if (consoleErrors.length) consoleErrors.slice(0, 20).forEach(e => console.log(' -', e));

  const pass = stuckCount === 0 && !negativeBalanceSeen && consoleErrors.length === 0 && finalPendingSpin === null;
  console.log(pass ? '\nSOAK TEST: PASS' : '\nSOAK TEST: FAIL');
  process.exit(pass ? 0 : 1);
})();
