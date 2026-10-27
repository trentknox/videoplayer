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
    if (section === '/watch-series/example') {
      await route.fulfill({ json: { provider: 'embed', kind: 'catalog', sourceUrl: requested, embedUrl: requested, title: 'Example Series', contentType: 'series', genres: ['Drama'], countries: ['Canada'], year: 2024, rating: 8, listings: [{ url: 'https://catalog.example/episode/example/s01-e01', title: 'Episode One', season: 1, episode: 1 }] } })
      return
    }
    if (section.startsWith('/episode/')) {
      await route.fulfill({ json: { provider: 'embed', kind: 'catalog', sourceUrl: requested, embedUrl: requested, title: 'Episode One', listings: [] } })
      return
    }
    const first = section === '/movies' ? 30 : section === '/shows' ? 32 : section === '/new' ? 34 : 0
    const count = section === '/' ? 30 : 2
    const listings = Array.from({ length: count }, (_, i) => ({ url: `https://media.example/film-${first + i}.mp4`, title: `Film ${first + i}` }))
    if (section === '/') listings.push({ url: 'https://catalog.example/watch-series/example', title: 'Example Series' })
    const catalogSections = [{ url: 'https://catalog.example/movies', title: 'Movies' }, { url: 'https://catalog.example/shows', title: 'TV Shows' }]
    await route.fulfill({ json: { provider: 'embed', kind: 'catalog', sourceUrl: requested, embedUrl: requested, title: 'Catalog', listings, catalogSections } })
  })
  await page.goto('http://127.0.0.1:4181/', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Source URL').fill('https://catalog.example/')
  await page.getByRole('button', { name: 'Import titles listed on this page' }).click()
  await page.getByRole('status').getByText(/Added 36 titles\. Scan complete/).waitFor({ timeout: 30000 })
  assert.match(await page.locator('.filter-summary').innerText(), /^37 items/)
  await page.getByRole('button', { name: 'Play Episode One' }).waitFor()
  await page.getByLabel('Genre', { exact: true }).selectOption({ label: 'Drama' })
  assert.match(await page.locator('.filter-summary').innerText(), /^1 item/)
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
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
  await page.getByRole('button', { name: 'Play Film 34' }).first().waitFor({ timeout: 30000 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await page.getByText('https://catalog.example/new', { exact: true }).waitFor()
  console.log('Browser test passed: catalog import, playlist ordering, and saved-source refresh')
} finally {
  await context.close()
  await browser.close()
}
