import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Start Vite on 127.0.0.1:4181 first. Uses a fresh Edge profile and mocked catalog data.
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
try {
  await page.route('**/api/analyze', async (route) => {
    const requested = route.request().postDataJSON().url
    const section = new URL(requested).pathname
    const first = section === '/movies' ? 30 : section === '/shows' ? 32 : section === '/new' ? 34 : 0
    const count = section === '/' ? 30 : 2
    const listings = Array.from({ length: count }, (_, i) => ({ url: `https://media.example/film-${first + i}.mp4`, title: `Film ${first + i}` }))
    const catalogSections = [{ url: 'https://catalog.example/movies', title: 'Movies' }, { url: 'https://catalog.example/shows', title: 'TV Shows' }]
    await route.fulfill({ json: { provider: 'embed', kind: 'catalog', sourceUrl: requested, embedUrl: requested, title: 'Catalog', listings, catalogSections } })
  })
  await page.goto('http://127.0.0.1:4181/', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Source URL').fill('https://catalog.example/')
  await page.getByRole('button', { name: 'Import titles listed on this page' }).click()
  await page.getByRole('status').getByText(/Added 34 titles\. Scan complete/).waitFor({ timeout: 30000 })
  assert.match(await page.locator('.filter-summary').innerText(), /^35 items/)
  await page.getByRole('button', { name: 'playlists', exact: true }).click()
  await page.getByPlaceholder('New playlist name').fill('Test trilogy')
  await page.getByRole('button', { name: 'Create playlist' }).click()
  const playlist = page.locator('.playlist-card').filter({ hasText: 'Test trilogy' })
  await playlist.getByText('Edit titles').click()
  await playlist.getByLabel('Film 0', { exact: true }).check()
  await playlist.getByLabel('Film 1', { exact: true }).check()
  await playlist.getByRole('button', { name: 'Move Film 1 earlier' }).click()
  const titles = await playlist.locator('li').allTextContents()
  assert.match(titles[1], /Film 1/)
  assert.match(titles[2], /Film 0/)
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await page.getByLabel('Source URL to save').fill('https://catalog.example/new')
  await page.getByRole('button', { name: 'Add source' }).click()
  await page.getByRole('button', { name: 'home', exact: true }).click()
  await page.getByRole('button', { name: 'Play Film 34' }).waitFor({ timeout: 30000 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await page.getByText('https://catalog.example/new', { exact: true }).waitFor()
  console.log('Browser test passed: catalog import, playlist ordering, and saved-source refresh')
} finally {
  await context.close()
  await browser.close()
}
