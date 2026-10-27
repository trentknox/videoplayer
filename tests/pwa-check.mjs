import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const context = await chromium.launchPersistentContext('', { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const page = await context.newPage()
try {
  await page.goto('https://vivid-media-player.pages.dev/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => navigator.serviceWorker.ready)
  const cdp = await context.newCDPSession(page)
  const manifest = await cdp.send('Page.getAppManifest')
  const installability = await cdp.send('Page.getInstallabilityErrors')
  const parsed = JSON.parse(manifest.data)
  assert.equal(parsed.display, 'standalone')
  assert.equal(parsed.icons.length, 2)
  assert.deepEqual(installability.installabilityErrors, [])
  console.log('PWA check passed: standalone manifest and browser installability')
} finally { await context.close() }
