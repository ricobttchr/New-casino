// Phase 5 requirement: "Jede Animation respektiert prefers-reduced-motion". Rather than
// trust a manual selector list, this asks the browser directly: with reduced-motion
// enabled, does ANY element anywhere on the page have a running (non-'none') CSS
// animation-name, at idle, mid-spin, and mid-gamble?
const { chromium } = require('playwright');
const path = require('path');

async function findRunningAnimations(page) {
  return page.evaluate(() => {
    const found = [];
    document.querySelectorAll('*').forEach((el) => {
      const name = getComputedStyle(el).animationName;
      if (name && name !== 'none') {
        found.push((el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName) + ' -> ' + name);
      }
    });
    return [...new Set(found)];
  });
}

(async () => {
  const results = [];
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('file://' + path.resolve(process.argv[2] || 'nova-casino.html'));
  await page.waitForTimeout(400);

  let running = await findRunningAnimations(page);
  results.push(['lobby idle: no running animations', running.length === 0, running]);

  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(400);
  running = await findRunningAnimations(page);
  results.push(['game idle: no running animations', running.length === 0, running]);

  await page.click('#spinButton', { force: true });
  await page.waitForTimeout(150); // mid-spin
  running = await findRunningAnimations(page);
  results.push(['mid-spin: no running animations', running.length === 0, running]);

  await page.waitForFunction(() => !document.querySelector('#spinButton').classList.contains('busy'), { timeout: 8000 });
  await page.click('#closeGame');
  await page.waitForTimeout(150);
  await page.click('[data-play="fruit-reactor"]');
  await page.waitForTimeout(150);
  let gambleOpen = false;
  for (let i = 0; i < 30 && !gambleOpen; i++) {
    await page.click('#spinButton', { force: true });
    await page.waitForFunction(() => !document.querySelector('#spinButton').classList.contains('busy'), { timeout: 8000 });
    gambleOpen = !(await page.$eval('#riskPanel', (el) => el.hidden));
  }
  if (gambleOpen) {
    await page.click('#riskRed', { force: true }).catch(() => {});
    await page.waitForTimeout(80); // mid-resolution (card flip window)
    running = await findRunningAnimations(page);
    results.push(['mid-gamble-resolution: no running animations', running.length === 0, running]);
  }

  await browser.close();
  console.log('\n=== REDUCED-MOTION AUDIT (0 running CSS animations expected everywhere) ===');
  let allPass = true;
  for (const [name, pass, found] of results) {
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + name);
    if (!pass) { allPass = false; found.forEach((f) => console.log('   still animating:', f)); }
  }
  process.exit(allPass ? 0 : 1);
})();
