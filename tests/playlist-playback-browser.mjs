import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
try {
  let resolutions = 0
  await page.route('**/api/analyze', async (route) => {
    resolutions++
    await route.fulfill({ json: { provider: 'direct', kind: 'video', sourceUrl: 'https://example.com/title', embedUrl: 'https://example.com/movie.mp4', title: 'Resolved title' } })
  })
  await page.goto('http://127.0.0.1:4181/')
  await page.getByRole('button', { name: 'playlists', exact: true }).waitFor()
  await page.waitForTimeout(500)
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('vivid-media-library', 1); request.onsuccess = () => resolve(request.result); request.onerror = reject })
    const state = { media: [
      { id: 'first', title: 'First video', provider: 'direct', kind: 'video', sourceUrl: 'https://example.com/first.mp4', embedUrl: 'https://example.com/first.mp4', durationSeconds: 120, tags: [], actors: [], addedAt: '2026-01-01', importMode: 'single' },
      { id: 'second', title: 'Second title', provider: 'embed', kind: 'catalog', sourceUrl: 'https://example.com/title', embedUrl: 'https://example.com/title', durationSeconds: 120, tags: [], actors: [], addedAt: '2026-01-01', importMode: 'page-analysis' },
    ], playlists: [{ id: 'queue', name: 'Queue test', mediaIds: ['first', 'second'], createdAt: '2026-01-01' }], channels: [] }
    await new Promise((resolve, reject) => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(state, 'library'); tx.oncomplete = resolve; tx.onerror = reject })
    db.close()
  })
  await page.reload()
  await page.getByRole('button', { name: 'playlists', exact: true }).click()
  await page.getByRole('button', { name: /Play first/ }).click()
  await page.locator('video').dispatchEvent('ended')
  await page.getByText('Player refreshed. Playback depends on the provider.').waitFor()
  assert.ok(resolutions >= 1)
  assert.equal(await page.locator('video').getAttribute('src'), 'https://example.com/movie.mp4')
  console.log('Playlist transition resolved the next catalog title and loaded its media URL')
} finally { await context.close(); await browser.close() }
