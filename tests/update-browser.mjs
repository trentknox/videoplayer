import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
let newVersion = false
try {
  await page.route('https://vivid-media-player.pages.dev/', (route) => newVersion
    ? route.fulfill({ contentType: 'text/html', body: '<script type="module" src="/assets/index-FutureVersion.js"></script>' })
    : route.continue())
  await page.goto('https://vivid-media-player.pages.dev/', { waitUntil: 'domcontentloaded' })
  const search = page.getByLabel('Search your library')
  await search.fill('unsaved search')
  await page.waitForTimeout(1000)
  newVersion = true
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.getByRole('status').getByText(/A Vivid update is ready/).waitFor({ timeout: 10000 })
  assert.equal(await search.inputValue(), 'unsaved search')
  console.log('Update detected without interrupting an active draft')
} finally { await context.close(); await browser.close() }
