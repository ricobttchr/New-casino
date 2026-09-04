// Regression test for a real, user-reported performance bug: "Spins laufen nicht
// flüssig" (spins don't run smoothly). Root-caused with Chrome DevTools tracing
// (disabled-by-default-devtools.timeline) on a CONTROLLED, seeded, identical spin
// outcome (seed 1 = a "boring" spin: no win, no feature, no mystery, so animation
// cost differences are never confounded by different random outcomes triggering
// extra win/feature/algae work):
//
//   with the Phase-5 ambient background animations (rising bubbles, drifting shark
//   silhouette, neon sparks, light motes, torch flicker -- one per game, all driven
//   by animating background-position/filter, which forces a main-thread repaint on
//   every frame unlike transform/opacity) left running DURING the spin, a single
//   spin cost ~690 RasterTask events and ~653 PaintImage events; pausing them for
//   the ~1-2s a spin takes (see the `.spin-active` class toggled in animateSpin())
//   brings that down to ~200 RasterTask / ~370 PaintImage -- essentially the same
//   as having them fully disabled.
//
// This asserts real numbers stay near the FIXED baseline, not the broken one, so a
// future change that makes some other decoration run unpaused during a spin (or
// undoes the pause) is caught here instead of only being "felt" on a real phone.
const { chromium } = require('playwright');
const path = require('path');

async function traceOneSpin(page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Tracing.start', { categories: 'disabled-by-default-devtools.timeline', options: 'sampling-frequency=1000' });
  await page.click('#spinButton', { force: true });
  await page.waitForFunction(() => !document.querySelector('#spinButton').classList.contains('busy'), { timeout: 8000 });
  const events = [];
  client.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await new Promise((resolve) => { client.once('Tracing.tracingComplete', resolve); client.send('Tracing.end'); });
  const counts = {};
  for (const e of events) if (e.ph === 'X' || e.ph === 'B') counts[e.name] = (counts[e.name] || 0) + 1;
  return counts;
}

(async () => {
  const results = [];
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.goto('file://' + path.resolve(process.argv[2] || 'nova-casino.html'));
  await page.waitForTimeout(300);
  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(300);

  // Seed 1: known "boring" spin (no win, no feature, no mystery) -- see
  // scratchpad note in the algae/perf work -- so every run measures the exact same
  // animation workload, not a random mix of win/feature/algae presentations on top.
  await page.evaluate(() => window.__novaTestHooks.setSeed(1));
  const counts = await traceOneSpin(page);
  await page.evaluate(() => window.__novaTestHooks.clearSeed());
  console.log(`measured during spin: RasterTask=${counts.RasterTask||0} PaintImage=${counts.PaintImage||0} UpdateLayer=${counts.UpdateLayer||0} RunTask=${counts.RunTask||0}`);

  // Generous margins above the measured post-fix baseline (~200 RasterTask, ~370
  // PaintImage) -- this is a regression guard against the fix being undone or a new
  // always-animating decoration being added during spin, not a tight perf budget.
  results.push(['RasterTask stays low during a spin (ambient animations paused)', counts.RasterTask < 350]);
  results.push(['PaintImage stays low during a spin (ambient animations paused)', counts.PaintImage < 500]);

  // Confirm the mechanism directly, not just its effect: the backdrop must actually
  // be paused while spinning and resume once idle.
  await page.evaluate(() => window.__novaTestHooks.setSeed(1));
  await page.click('#spinButton', { force: true });
  await page.waitForTimeout(150);
  const midSpin = await page.evaluate(() => {
    const bg = document.querySelector('.underwater-bg');
    return { hasClass: bg.classList.contains('spin-active'), before: getComputedStyle(bg, '::before').animationPlayState, after: getComputedStyle(bg, '::after').animationPlayState };
  });
  results.push(['ambient backdrop is marked spin-active mid-spin', midSpin.hasClass]);
  results.push(['ambient backdrop animations are actually paused mid-spin', midSpin.before === 'paused' && midSpin.after === 'paused']);
  await page.waitForFunction(() => !document.querySelector('#spinButton').classList.contains('busy'), { timeout: 8000 });
  await page.evaluate(() => window.__novaTestHooks.clearSeed());
  await page.waitForTimeout(100);
  const afterSpin = await page.evaluate(() => {
    const bg = document.querySelector('.underwater-bg');
    return { hasClass: bg.classList.contains('spin-active'), before: getComputedStyle(bg, '::before').animationPlayState, after: getComputedStyle(bg, '::after').animationPlayState };
  });
  results.push(['ambient backdrop resumes animating once the spin settles', !afterSpin.hasClass && afterSpin.before === 'running' && afterSpin.after === 'running']);

  await browser.close();
  console.log('\n=== SPIN PERFORMANCE TEST ===');
  let allPass = true;
  for (const [name, pass] of results) { console.log((pass ? 'PASS' : 'FAIL') + '  ' + name); if (!pass) allPass = false; }
  process.exit(allPass ? 0 : 1);
})();
