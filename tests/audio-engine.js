// Phase 6 (Audio Engine): verifies the bus/limiter architecture actually exists at
// runtime and that Sound-Off truly silences the master bus immediately (not just gates
// future tones), using the read-only window.__novaAudioDebug hook (tests only, no
// control surface). Chromium's headless Web Audio implementation runs fine without real
// audio hardware, so gain values and node presence are real, not mocked.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const results = [];
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.goto('file://' + path.resolve(process.argv[2] || 'nova-casino.html'));
  await page.waitForTimeout(300);

  let state = await page.evaluate(() => window.__novaAudioDebug.inspect());
  results.push(['AudioContext not created before any interaction', state.ctxState === 'none']);

  await page.click('[data-play="shark-abyss"]');
  await page.waitForTimeout(150);
  await page.click('#spinButton', { force: true });
  await page.waitForTimeout(150); // a tone has definitely fired by now (spin sound)

  state = await page.evaluate(() => window.__novaAudioDebug.inspect());
  results.push(['AudioContext created after first sound-triggering interaction', state.ctxState === 'running' || state.ctxState === 'suspended']);
  results.push(['limiter (DynamicsCompressor) present on the master chain', state.hasLimiter]);
  results.push(['ui/reel/win/feature/music buses all present', ['ui', 'reel', 'win', 'feature', 'music'].every((b) => state.busNames.includes(b))]);
  results.push(['master gain is 1 (unmuted) while sound is on', Math.abs(state.masterGain - 1) < 0.01]);

  // Toggle sound off mid-flight and confirm the master bus actually ramps to 0, not just
  // that future soundFx() calls are gated.
  await page.click('#soundToggle', { force: true });
  await page.waitForTimeout(150); // let the 70ms mute ramp finish
  state = await page.evaluate(() => window.__novaAudioDebug.inspect());
  results.push(['master gain ramped to 0 immediately on Sound-Off', state.masterGain < 0.01]);

  await page.click('#spinButton', { force: true }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('#spinButton').classList.contains('busy'), { timeout: 8000 }).catch(() => {});
  state = await page.evaluate(() => window.__novaAudioDebug.inspect());
  results.push(['master gain stays 0 while spinning with sound off', state.masterGain < 0.01]);

  // Toggle back on and confirm it actually restores.
  await page.click('#soundToggle', { force: true });
  await page.waitForTimeout(150);
  state = await page.evaluate(() => window.__novaAudioDebug.inspect());
  results.push(['master gain restored to 1 on Sound-On', Math.abs(state.masterGain - 1) < 0.01]);

  results.push(['zero page errors touching the audio engine', consoleErrors.length === 0]);
  if (consoleErrors.length) consoleErrors.forEach((e) => console.log('  error:', e));

  await browser.close();
  console.log('\n=== AUDIO ENGINE TEST ===');
  let allPass = true;
  for (const [name, pass] of results) { console.log((pass ? 'PASS' : 'FAIL') + '  ' + name); if (!pass) allPass = false; }
  process.exit(allPass ? 0 : 1);
})();
