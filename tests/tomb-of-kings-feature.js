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
  const fileUrl = 'file://' + path.resolve(process.argv[2] || 'nova-casino.html');
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  await page.goto(fileUrl);
  await page.waitForTimeout(300);
  await page.click('[data-play="tomb-of-kings"]');
  await page.waitForTimeout(200);
  await page.click('#quickButton');

  let freeSpinsTriggered = false, expandSeen = false, retriggerSeen = false;
  let sawFreeMode = false;
  for (let i = 0; i < 400 && !(freeSpinsTriggered && expandSeen); i++) {
    const disabled = await page.$eval('#spinButton', el => el.disabled).catch(() => true);
    if (disabled) { await page.waitForTimeout(50); continue; }
    await page.click('#spinButton').catch(() => {});
    await waitSpinIdle(page).catch(() => {});
    const featureMode = await page.$eval('#app', el => el.classList.contains('feature-mode')).catch(() => false);
    if (featureMode) { freeSpinsTriggered = true; sawFreeMode = true; }
    const winnersInFeature = sawFreeMode ? (await page.$$('.symbol.winner')).length : 0;
    if (sawFreeMode && winnersInFeature >= 6) expandSeen = true; // expanding symbol covers a full reel (3 cells) x >=2 reels typically
  }
  results.push(['tomb-of-kings: free spins triggered within 400 spins', freeSpinsTriggered]);
  results.push(['tomb-of-kings: many winner cells seen during free spins (expanding symbol plausible)', expandSeen]);
  results.push(['zero console errors', consoleErrors.length === 0]);
  if (consoleErrors.length) consoleErrors.slice(0,10).forEach(e => console.log(' err:', e));

  await browser.close();
  console.log('\n=== TOMB OF KINGS FEATURE TEST ===');
  let allPass = true;
  for (const [name, pass] of results) { console.log((pass ? 'PASS' : 'FAIL') + '  ' + name); if (!pass) allPass = false; }
  process.exit(allPass ? 0 : 1);
})();
