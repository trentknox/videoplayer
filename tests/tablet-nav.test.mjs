// Tablet nav acceptance: sheet below 1280px, rail at 1280px and up
// (min-width: 1280, not >1280). Verifies reachability at 639/640/1279/1280/1281,
// no double navigation, and the rail/sheet overflow split.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 4237;
const BASE = `http://127.0.0.1:${PORT}/`;
const REPO = new URL('..', import.meta.url).pathname;

function startPreview() {
  return spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: REPO,
    stdio: 'ignore',
  });
}

let server;
try {
  server = startPreview();
  for (let i = 0; i < 60; i += 1) {
    try {
      await fetch(BASE + 'index.html');
      break;
    } catch {
      await sleep(250);
    }
  }
} catch (error) {
  console.error('Failed to start vite preview:', error.message);
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch();
  try {
    const widths = [639, 640, 1279, 1280, 1281];
    const destinations = ['Home', 'Player', 'Library', 'Playlists', 'Channels', 'History', 'Settings'];

    for (const width of widths) {
      const page = await browser.newPage();
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const navCount = await page.locator('nav').count();
      const labels = (await page.locator('nav button').allInnerTexts()).map((s) => s.trim());
      const navOverflow = await page.locator('nav').evaluate((el) => getComputedStyle(el).overflowX);

      // No double navigation: exactly one nav element.
      assert.equal(navCount, 1, `width ${width}: expected 1 nav, got ${navCount}`);

      // Every destination reachable at every tablet breakpoint.
      for (const dest of destinations) {
        assert.ok(labels.includes(dest), `width ${width}: missing destination "${dest}" (${labels.join(', ')})`);
      }

      // Rail (>=1280) is non-scrolling; sheet (<1280) scrolls horizontally.
      const expectedOverflow = width >= 1280 ? 'visible' : 'auto';
      assert.equal(navOverflow, expectedOverflow, `width ${width}: expected overflow "${expectedOverflow}", got "${navOverflow}"`);
      await page.close();
    }
  } finally {
    await browser.close();
    if (server) server.kill('SIGTERM');
  }

  console.log('tablet nav acceptance passed: rail @>=1280, sheet <1280, all destinations reachable at 639/640/1279/1280/1281, no double navigation');
})().catch((error) => {
  console.error('tablet nav acceptance failed:', error.message);
  process.exit(1);
});
