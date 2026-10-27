import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
let detailRequests = 0
try {
  await page.route('**/api/analyze', async (route) => {
    const url = route.request().postDataJSON().url
    if (url.endsWith('/')) return route.fulfill({ json: { provider: 'embed', kind: 'catalog', sourceUrl: url, embedUrl: url, title: 'Catalog', listings: [{ title: 'Runner', url: `${url}movie` }] } })
    detailRequests += 1
    return route.fulfill({ json: { provider: 'embed', kind: detailRequests === 1 ? 'catalog' : 'video', sourceUrl: url, embedUrl: detailRequests === 1 ? url : 'https://player.example/embed', title: 'Runner', listings: [] } })
  })
  await page.route('https://player.example/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Player loaded</title>' }))
  await page.goto('http://127.0.0.1:4181/', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Source URL').fill('https://catalog.example/')
  await page.getByRole('button', { name: 'Import titles listed on this page' }).click()
  await page.getByRole('button', { name: 'Play Runner' }).click()
  await page.locator('iframe.media-embed').waitFor({ timeout: 10000 })
  assert.equal(await page.locator('iframe.media-embed').getAttribute('src'), 'https://player.example/embed')
  console.log('Previously saved website refreshed to an available player on selection')
} finally { await context.close(); await browser.close() }
