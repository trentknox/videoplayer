import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
let newVersion = false
let reloadSeen = false
try {
  await page.route('https://vivid-media-player.pages.dev/', (route) => {
    if (newVersion && route.request().isNavigationRequest()) { reloadSeen = true; return route.abort() }
    return newVersion ? route.fulfill({ contentType: 'text/html', body: '<script type="module" src="/assets/index-FutureVersion.js"></script>' }) : route.continue()
  })
  await page.goto('https://vivid-media-player.pages.dev/', { waitUntil: 'domcontentloaded' })
  const search = page.getByLabel('Search your library')
  await search.fill('unsaved search')
  await page.waitForTimeout(1000)
  newVersion = true
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.getByRole('status').getByText(/A Vivid update is ready/).waitFor({ timeout: 10000 })
  assert.equal(await search.inputValue(), 'unsaved search')
  await search.fill('')
  await search.blur()
  await page.locator('video').evaluate((video) => video.pause())
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.waitForTimeout(1200)
  assert.equal(reloadSeen, true, 'The app should reload automatically when idle')
  console.log('Update waits for an active draft, then reloads when idle')
} finally { await context.close(); await browser.close() }
