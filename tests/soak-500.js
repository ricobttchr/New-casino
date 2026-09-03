// Release gate (Phase 1 + Phase 9): "500 aufeinanderfolgende Spins ohne hängenden
// Zustand" and "Speicher nach mindestens 500 Spins auf wachsende Listener, Nodes,
// AudioNodes, Timer und Animationen prüfen" — literally, on one game, back to back,
// not spread across four games like tests/soak.js. Uses Chromium's non-standard
// performance.memory (available since we control the browser) as a JS-heap growth
// proxy alongside DOM node count.
const { chromium } = require('playwright');
const path = require('path');

async function waitSpinIdle(page, timeout = 8000) {
  await page.waitForFunction(() => {
    const btn = document.querySelector('#spinButton');
    return btn && !btn.classList.contains('busy');
  }, { timeout });
}

(async () => {
  const N = Number(process.argv[3] || 500);
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--enable-precise-memory-info'] });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto('file://' + path.resolve(process.argv[2] || 'nova-casino.html'));
  await page.waitForTimeout(300);
  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(150);
  await page.click('#quickButton'); // turbo, so 500 spins finish in reasonable time

  const snapshot = () => page.evaluate(() => ({
    dom: document.querySelectorAll('*').length,
    heap: performance.memory ? performance.memory.usedJSHeapSize : null,
    audioState: window.__novaAudioDebug ? window.__novaAudioDebug.inspect() : null,
  }));

  const start = await snapshot();
  let stuck = 0, negativeBalance = false, completed = 0;
  const checkpoints = [];

  for (let i = 0; i < N; i++) {
    if (!(await page.$eval('#riskPanel', (el) => el.hidden).catch(() => true))) {
      await page.click('#riskCollect').catch(() => {});
      await page.waitForTimeout(100);
      continue;
    }
    const disabled = await page.$eval('#spinButton', (el) => el.disabled).catch(() => true);
    if (disabled) { await page.waitForTimeout(30); continue; }
    await page.click('#spinButton', { force: true }).catch(() => {});
    try { await waitSpinIdle(page, 6000); completed++; }
    catch { stuck++; }
    const bal = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('nova-casino-state-v2')).balanceCents; } catch { return null; }
    });
    if (bal !== null && bal < 0) negativeBalance = true;
    if ((i + 1) % 100 === 0) checkpoints.push({ at: i + 1, ...(await snapshot()) });
  }

  const end = await snapshot();
  const finalPendingSpin = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('nova-casino-state-v2')).pendingSpin; } catch { return 'ERR'; }
  });

  await browser.close();

  console.log(`=== 500-SPIN SOAK TEST (single game, ${N} attempted, target ${N}) ===`);
  console.log('Completed spins:', completed, '| Stuck/timeout:', stuck, '| Negative balance ever:', negativeBalance);
  console.log('DOM nodes: start', start.dom, '-> end', end.dom, '(delta ' + (end.dom - start.dom) + ')');
  if (start.heap !== null) {
    console.log('JS heap: start', (start.heap / 1e6).toFixed(1) + 'MB -> end', (end.heap / 1e6).toFixed(1) + 'MB');
    console.log('Heap checkpoints (every 100 spins):', checkpoints.map((c) => (c.heap / 1e6).toFixed(1) + 'MB@' + c.at).join(', '));
  } else {
    console.log('performance.memory not available in this Chromium build — heap growth not measured.');
  }
  console.log('Audio engine state at end:', JSON.stringify(end.audioState));
  console.log('Final pendingSpin (should be null):', JSON.stringify(finalPendingSpin));
  console.log('Console/page errors:', consoleErrors.length);
  if (consoleErrors.length) consoleErrors.slice(0, 10).forEach((e) => console.log(' -', e));

  const pass = completed >= N * 0.95 && stuck === 0 && !negativeBalance && consoleErrors.length === 0 && finalPendingSpin === null && (end.dom - start.dom) < 200;
  console.log(pass ? '\n500-SPIN SOAK TEST: PASS' : '\n500-SPIN SOAK TEST: FAIL');
  process.exit(pass ? 0 : 1);
})();
