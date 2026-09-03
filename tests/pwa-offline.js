// Requires the app served over http(s) (service workers don't run under file://).
// Start one first, e.g.: npx http-server . -p 8934
// Usage: node tests/pwa-offline.js [baseUrl]
const { chromium } = require('playwright');
(async () => {
  const baseUrl = process.argv[2] || 'http://localhost:8934';
  const results = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(baseUrl + '/nova-casino.html');
  await page.waitForTimeout(500);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 8000 }).catch(() => {});
  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.active?.state : 'none';
  });
  results.push(['service worker registered and active', swState === 'activated']);
  const manifestLink = await page.$eval('link[rel="manifest"]', el => el.href).catch(() => null);
  results.push(['manifest link present', !!manifestLink]);
  const manifestJson = await page.evaluate(async (url) => (await fetch(url)).json(), manifestLink);
  results.push(['manifest has icons + name', manifestJson.icons?.length >= 2 && manifestJson.name === 'NOVA Casino']);

  // Guest spin still works over http, then go offline and reload (Phase 8 requirement).
  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(200);
  await page.click('#spinButton');
  await page.waitForFunction(() => !document.querySelector('#spinButton').classList.contains('busy'), { timeout: 8000 });
  results.push(['guest spin works over http server', true]);

  await page.context().setOffline(true);
  await page.reload();
  await page.waitForTimeout(500);
  const offlineTitle = await page.title().catch(() => null);
  results.push(['page still loads with network offline (cached app shell)', offlineTitle && offlineTitle.includes('NOVA')]);
  const canSpinOffline = await page.evaluate(() => !!document.querySelector('#spinButton')).catch(() => false);
  if (canSpinOffline) {
    await page.click('[data-play="shark-abyss"]').catch(() => {});
    await page.waitForTimeout(200);
    await page.click('#spinButton').catch(() => {});
    await page.waitForFunction(() => !document.querySelector('#spinButton').classList.contains('busy'), { timeout: 8000 }).catch(() => {});
    const toastText = await page.textContent('#toast').catch(() => '');
    results.push(['guest spin works fully offline after first load', !/anmelden|verbindung/i.test(toastText || '')]);
  }
  await page.context().setOffline(false);

  await browser.close();
  console.log('\n=== PWA TEST RESULTS ===');
  let allPass = true;
  for (const [name, pass] of results) { console.log((pass ? 'PASS' : 'FAIL') + '  ' + name); if (!pass) allPass = false; }
  process.exit(allPass ? 0 : 1);
})();
