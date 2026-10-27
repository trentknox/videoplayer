import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// This checks the deployed app using an isolated profile and the built-in public sample.
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
try {
  await page.goto(process.env.VIVID_TEST_URL || 'https://vivid-media-player.pages.dev/', { waitUntil: 'domcontentloaded' })
  const video = page.locator('video.media-video')
  await video.waitFor({ timeout: 30000 })
  await video.evaluate((element) => { element.muted = true })
  await video.evaluate((element) => element.play())
  await page.waitForFunction(() => {
    const video = document.querySelector('video.media-video')
    return video && !video.paused && video.currentTime > 1 && video.readyState >= 2
  }, null, { timeout: 30000 })
  const state = await video.evaluate((element) => ({ time: element.currentTime, width: element.videoWidth, error: element.error?.code }))
  assert.ok(state.width > 0, 'A video frame should have loaded')
  console.log(`Published sample played: ${state.time.toFixed(1)}s, ${state.width}px wide`)
} finally {
  await context.close()
  await browser.close()
}
