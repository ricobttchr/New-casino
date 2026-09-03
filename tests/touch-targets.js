// Phase 5 (AUDIT/master-prompt requirement): every interactive control must be at least
// 44x44 CSS pixels, per Apple/WCAG touch-target guidance. Measures every visible
// button/interactive element at the canonical iPhone 15 Pro viewport (393x852), in both
// the lobby and inside each game (including the risk/gamble panel).
const { chromium } = require('playwright');
const path = require('path');

async function measure(page, label, results) {
  const boxes = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, [role="button"], input, a')];
    return els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !el.closest('[hidden]');
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { sel: el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName, w: Math.round(r.width), h: Math.round(r.height) };
      });
  });
  for (const b of boxes) {
    const ok = b.w >= 44 && b.h >= 44;
    results.push([`${label}: ${b.sel} (${b.w}x${b.h})`, ok]);
  }
}

(async () => {
  const results = [];
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('file://' + path.resolve(process.argv[2] || 'nova-casino.html'));
  await page.waitForTimeout(300);
  await measure(page, 'lobby', results);

  for (const game of ['shark-abyss', 'fruit-reactor', 'fancy-harvest', 'tomb-of-kings']) {
    await page.click(`[data-play="${game}"]`);
    await page.waitForTimeout(200);
    await measure(page, game, results);
    await page.click('#closeGame');
    await page.waitForTimeout(150);
  }

  // Risk panel controls (Fruit Reactor card mode + Fancy Harvest ladder mode)
  await page.click('[data-play="fruit-reactor"]');
  await page.waitForTimeout(150);
  for (let i = 0; i < 30; i++) {
    await page.click('#spinButton', { force: true });
    await page.waitForFunction(() => !document.querySelector('#spinButton').classList.contains('busy'), { timeout: 8000 });
    if (!(await page.$eval('#riskPanel', (el) => el.hidden))) break;
  }
  await measure(page, 'fruit-reactor risk panel', results);

  await browser.close();
  console.log('\n=== TOUCH TARGET AUDIT (>=44x44 CSS px required) ===');
  let allPass = true;
  const fails = [];
  for (const [name, pass] of results) {
    if (!pass) { fails.push(name); allPass = false; }
  }
  console.log('Total elements checked:', results.length, '| Failing:', fails.length);
  fails.forEach((f) => console.log('FAIL ', f));
  process.exit(allPass ? 0 : 1);
})();
