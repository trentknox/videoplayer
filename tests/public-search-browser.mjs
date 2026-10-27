import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
let rootRequests = 0
try {
  await page.route('**/api/analyze', async (route) => {
    const url = route.request().postDataJSON().url
    if (url === 'https://catalog.example/') {
      rootRequests++
      if (rootRequests === 1) await new Promise((resolve) => setTimeout(resolve, 12000))
      return route.fulfill({ json: { provider: 'embed', kind: 'catalog', sourceUrl: url, embedUrl: url, title: 'Catalog', listings: [], searchForm: { url: 'https://catalog.example/search', parameter: 'keyword' } } }).catch(() => {})
    }
    const parsed = new URL(url)
    assert.equal(parsed.searchParams.get('keyword'), 'john wick')
    await route.fulfill({ json: { provider: 'embed', kind: 'catalog', sourceUrl: url, embedUrl: url, title: 'Results', listings: [{ url: 'https://catalog.example/watch/john-wick', title: 'John Wick' }] } })
  })
  await page.goto('http://127.0.0.1:4181/')
  await page.getByLabel('Search your library').waitFor()
  await page.waitForTimeout(400)
  await page.evaluate(async () => {
    const db = await new Promise((resolve) => { const r = indexedDB.open('vivid-media-library', 1); r.onsuccess = () => resolve(r.result) })
    const state = await new Promise((resolve) => { const tx = db.transaction('state'); const r = tx.objectStore('state').get('library'); r.onsuccess = () => resolve(r.result) })
    state.sources = [{ id: 'source', url: 'https://catalog.example/' }]
    await new Promise((resolve) => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(state, 'library'); tx.oncomplete = resolve })
    db.close()
  })
  await page.reload()
  for (let i = 0; i < 40 && rootRequests === 0; i++) await page.waitForTimeout(100)
  assert.ok(rootRequests >= 1, 'background scan started')
  await page.getByLabel('Search your library').fill('john wick')
  await page.getByRole('button', { name: /Ask AI/ }).click()
  await page.getByRole('dialog').getByText(/Searched 1 source directly/).waitFor({ timeout: 8000 })
  console.log('Search dialog:', await page.getByRole('dialog').innerText()); await page.getByRole('dialog').locator('.ai-preview-card').filter({ hasText: 'John Wick' }).waitFor({ timeout: 8000 })
  assert.ok(rootRequests >= 2)
  console.log('Direct source search returned John Wick while the background catalog scan was still running')
} finally { await context.close(); await browser.close() }

