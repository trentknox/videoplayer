import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const url = process.env.VIVID_STREAM_URL
if (!url) throw new Error('Set VIVID_STREAM_URL to a public Cloudflare Stream HLS URL')
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
try {
  await page.goto(process.env.VIVID_TEST_URL || 'https://vivid-media-player.pages.dev/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'library', exact: true }).click()
  await page.locator('details.import-card > summary').click()
  await page.getByLabel('Source URL').fill(url)
  await page.getByRole('button', { name: 'Analyze & import' }).click()
  await page.getByRole('button', { name: 'Play Cloudflare Stream video' }).click()
  const video = page.locator('video.media-video')
  await video.waitFor()
  await video.evaluate((element) => { element.muted = true })
  await video.evaluate((element) => element.play())
  await page.waitForFunction(() => {
    const video = document.querySelector('video.media-video')
    return video && !video.paused && video.currentTime > 1 && video.readyState >= 2
  }, null, { timeout: 30000 })
  const state = await video.evaluate((element) => ({ time: element.currentTime, width: element.videoWidth }))
  assert.ok(state.width > 0, 'Expected a decoded Stream video frame')
  console.log(`Cloudflare Stream played: ${state.time.toFixed(1)}s, ${state.width}px wide`)
} finally {
  await context.close()
  await browser.close()
}
