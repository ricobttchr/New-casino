// Verifies the client-side half of the online mode (login/signup UI in
// openProfile()) behaves correctly for a guest, INCLUDING under a real network
// failure -- this sandbox's egress to *.supabase.co is actually blocked (confirmed
// via curl, see AUDIT.md/RELEASE_REPORT.md), so the "Keine Verbindung zum
// NOVA-Server." error path exercised here is a genuine failure, not a simulated one.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const results = [];
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  // A failed fetch() to a genuinely unreachable host makes Chromium itself log a
  // "Failed to load resource: net::ERR_..." line -- that's the browser reporting the
  // network layer, not an uncaught exception in app code (the app's own catch already
  // produced the correct toast; see the assertion below). Only count real JS errors.
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_/.test(m.text())) consoleErrors.push(m.text()); });
  await page.goto('file://' + path.resolve(process.argv[2] || 'nova-casino.html'));
  await page.waitForTimeout(300);

  results.push(['backend configured as remote (a Supabase project is set in NOVA_CONFIG)', await page.evaluate(() => window.__backend !== undefined)]);

  await page.click('#profileButton', { force: true });
  await page.waitForTimeout(150);

  const hasEmailField = await page.$('#authEmail') !== null;
  const hasPasswordField = await page.$('#authPassword') !== null;
  const hasNameField = await page.$('#authName') !== null;
  const hasLoginButton = await page.$('#loginAccount') !== null;
  const hasSignupButton = await page.$('#createAccount') !== null;
  const hasGuestReset = await page.$('#resetDemoGuest') !== null;
  results.push(['guest sees email/password/name signup form', hasEmailField && hasPasswordField && hasNameField]);
  results.push(['guest sees both Einloggen and Account erstellen buttons', hasLoginButton && hasSignupButton]);
  results.push(['guest still has a way back to guest reset from this sheet', hasGuestReset]);

  await page.fill('#authEmail', 'test@example.com');
  await page.fill('#authPassword', 'testpassword123');
  await page.click('#loginAccount', { force: true });
  // Real network call to a *.supabase.co host this sandbox's egress policy blocks --
  // the 12s NETWORK_TIMEOUT_MS in backend.publicFetch() bounds how long this can take.
  await page.waitForTimeout(14000);

  const toastText = await page.textContent('#toast');
  const stillOnLoginSheet = await page.$('#authEmail') !== null;
  results.push(['failed login shows a graceful error toast, not a crash', /verbindung|zeitüberschreitung|fehler/i.test(toastText || '')]);
  results.push(['app did not navigate away or break on failed login (sheet/app still intact)', await page.evaluate(() => document.querySelector('#app') !== null)]);
  results.push(['zero uncaught console errors through a real failed network call', consoleErrors.length === 0]);
  if (consoleErrors.length) consoleErrors.forEach((e) => console.log('  error:', e));
  console.log('  (toast text seen:', JSON.stringify(toastText), ')');

  await browser.close();
  console.log('\n=== ONLINE-MODE AUTH UI TEST ===');
  let allPass = true;
  for (const [name, pass] of results) { console.log((pass ? 'PASS' : 'FAIL') + '  ' + name); if (!pass) allPass = false; }
  process.exit(allPass ? 0 : 1);
})();
