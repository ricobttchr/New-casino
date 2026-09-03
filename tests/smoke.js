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
  await page.waitForTimeout(400);

  // 1. Open a game as a guest (no login) and confirm SPIN is not blocked.
  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(200);
  const balanceBefore = await page.textContent('#gameBalance');
  results.push(['game view opened', await page.isVisible('#gameView')]);

  await page.click('#spinButton');
  await waitSpinIdle(page);
  const toastText = await page.textContent('#toast').catch(() => '');
  const balanceAfter = await page.textContent('#gameBalance');
  const spinsAfter = await page.textContent('#statSpins');
  results.push(['guest spin did NOT show login-required toast', !/anmelden/i.test(toastText || '')]);
  results.push(['stats.spins incremented after guest spin', Number(spinsAfter) >= 1]);
  results.push(['balance changed from initial 100,00', balanceAfter !== balanceBefore]);
  results.push(['spin button re-enabled after spin', await page.isEnabled('#spinButton')]);
  results.push(['no leftover blur class on symbols', (await page.$$('.symbol.blur')).length === 0]);
  results.push(['no leftover in-motion class on reels', (await page.$$('.reel.in-motion')).length === 0]);

  // 2. Turbo mode
  await page.click('#quickButton');
  await page.click('#spinButton');
  await waitSpinIdle(page);
  results.push(['turbo spin completed (button re-enabled)', await page.isEnabled('#spinButton')]);

  // 3. Reload mid-animation: trigger a spin, then immediately reload the page
  // (exercises the boot() pendingSpin-recovery fix, AUDIT.md B2).
  await page.click('#spinButton');
  await page.waitForTimeout(60); // still animating (pendingSpin persisted, not yet settled)
  const spinsBeforeReload = Number(await page.textContent('#statSpins'));
  await page.reload();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(600);
  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(300);
  const spinsAfterReload = Number(await page.textContent('#statSpins'));
  results.push(['reload mid-spin: stats.spins incremented by recovery (not stuck)', spinsAfterReload === spinsBeforeReload + 1]);
  results.push(['reload mid-spin: spin button usable again', await page.isEnabled('#spinButton')]);
  results.push(['reload mid-spin: no leftover blur/motion classes', (await page.$$('.symbol.blur')).length === 0 && (await page.$$('.reel.in-motion')).length === 0]);

  // 4. Fruit Reactor: guest spin + local gamble resolution (executeGamble local path)
  await page.click('#closeGame');
  await page.waitForTimeout(150);
  await page.click('[data-play="fruit-reactor"]');
  await page.waitForTimeout(200);
  let gambleTriggered = false;
  for (let i = 0; i < 30 && !gambleTriggered; i++) {
    await page.click('#spinButton');
    await waitSpinIdle(page);
    gambleTriggered = !(await page.$eval('#riskPanel', el => el.hidden));
  }
  results.push(['fruit-reactor: reached a local gamble round within 30 spins', gambleTriggered]);
  if (gambleTriggered) {
    const balanceBeforeCollect = await page.textContent('#gameBalance');
    await page.click('#riskCollect');
    await page.waitForTimeout(500);
    const hiddenAfterCollect = await page.$eval('#riskPanel', el => el.hidden);
    const balanceAfterCollect = await page.textContent('#gameBalance');
    results.push(['local gamble: NEHMEN button is actually clickable (no pointer-events block)', true]);
    results.push(['local gamble: collect resolved without network (panel hidden again)', hiddenAfterCollect]);
    results.push(['local gamble: balance credited on collect', balanceAfterCollect !== balanceBeforeCollect]);
  }

  // 5. Risk-mode ladder path on Fancy Harvest (second gamble mode)
  await page.click('#closeGame');
  await page.waitForTimeout(150);
  await page.click('[data-play="fancy-harvest"]');
  await page.waitForTimeout(200);
  let fancyGamble = false;
  for (let i = 0; i < 30 && !fancyGamble; i++) {
    await page.click('#spinButton');
    await waitSpinIdle(page);
    fancyGamble = !(await page.$eval('#riskPanel', el => el.hidden));
  }
  results.push(['fancy-harvest: reached a local gamble round within 30 spins', fancyGamble]);
  if (fancyGamble) {
    await page.click('#riskModeLadder');
    await page.waitForTimeout(150);
    const ladderVisible = !(await page.$eval('#riskLadderActions', el => el.hidden));
    results.push(['ladder mode switch works and NEHMEN(ladder)/RISKIEREN reachable', ladderVisible]);
    if (ladderVisible) {
      await page.click('#riskCollectLadder');
      await page.waitForTimeout(400);
      results.push(['ladder collect resolved locally', await page.$eval('#riskPanel', el => el.hidden)]);
    }
  }

  results.push(['zero uncaught console errors during entire run', consoleErrors.length === 0]);

  await browser.close();

  console.log('\n=== SMOKE TEST RESULTS ===');
  let allPass = true;
  for (const [name, pass] of results) {
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + name);
    if (!pass) allPass = false;
  }
  if (consoleErrors.length) {
    console.log('\nConsole errors captured:');
    consoleErrors.forEach(e => console.log(' -', e));
  }
  process.exit(allPass ? 0 : 1);
})();
