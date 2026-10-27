import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
try {
  await page.route('**/api/analyze', async (route) => {
    const sourceUrl = route.request().postDataJSON().url
    await route.fulfill({ json: { provider: 'embed', kind: 'catalog', sourceUrl, embedUrl: sourceUrl, title: 'Catalog', listings: [{ url: 'https://catalog.example/watch-movie/one', title: 'Film One', poster: 'https://catalog.example/poster.png' }] } })
  })
  await page.route('https://catalog.example/poster.png', async (route) => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l5QAAAAASUVORK5CYII=', 'base64') }))
  await page.goto('http://127.0.0.1:4181/')
  await page.getByRole('button', { name: 'library', exact: true }).waitFor()
  await page.waitForTimeout(400)
  await page.evaluate(async () => {
    const db = await new Promise((resolve) => { const req = indexedDB.open('vivid-media-library', 1); req.onsuccess = () => resolve(req.result) })
    const state = { media: [{ id: 'film', title: 'Film One', provider: 'embed', kind: 'catalog', sourceUrl: 'https://catalog.example/watch-movie/one', embedUrl: 'https://catalog.example/watch-movie/one', durationSeconds: 900, tags: [], actors: [], addedAt: '2026-01-01', importMode: 'page-analysis' }], playlists: [], channels: [] }
    await new Promise((resolve) => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(state, 'library'); tx.oncomplete = resolve })
    db.close()
  })
  await page.reload()
  await page.getByRole('button', { name: 'library', exact: true }).click()
  const card = page.locator('.library-view .media-card').filter({ hasText: 'Film One' })
  await card.locator('img[src="https://catalog.example/poster.png"]').waitFor({ timeout: 15000 })
  assert.equal(await card.locator('img').count(), 1)
  console.log('A missing poster on an existing library title was repaired from its catalog')
} finally { await context.close(); await browser.close() }

