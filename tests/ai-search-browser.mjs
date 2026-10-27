import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
try {
  await page.route('https://catalog.example/poster.jpg', async (route) => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l5QAAAAASUVORK5CYII=', 'base64') }))
  await page.route('**/api/analyze', async (route) => {
    const sourceUrl = route.request().postDataJSON().url
    await route.fulfill({ json: { provider: 'embed', kind: 'catalog', sourceUrl, embedUrl: sourceUrl, title: 'Catalog', listings: [{ url: 'https://catalog.example/new-video.mp4', title: 'New source video', poster: 'https://catalog.example/poster.jpg' }] } })
  })
  await page.route('https://ai.example/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const search = path === '/v1/infer' ? JSON.parse(route.request().postDataJSON().messages[1].content) : undefined
    const match = search?.library.find((item) => item.title === 'New source video')
    const payload = path === '/v1/login' ? { token: 'test-session' } : path === '/v1/infer' ? { text: JSON.stringify({ name: 'Animation channel', ids: [match?.id, 'unknown'], action: 'channel', suggestions: [{ name: 'Animation favorites', ids: [match?.id] }] }) } : { ok: true }
    await route.fulfill({ json: payload, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS' } })
  })
  await page.goto('http://127.0.0.1:4181/')
  await page.getByLabel('Search your library').fill('Create a 24/7 Keanu Reeves channel')
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await page.getByRole('dialog').getByText(/AI is unavailable/).waitFor()
  await page.getByRole('button', { name: 'Close search results' }).click()
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await page.waitForTimeout(400)
  await page.evaluate(async () => {
    const db = await new Promise((resolve) => { const request = indexedDB.open('vivid-media-library', 1); request.onsuccess = () => resolve(request.result) })
    const state = await new Promise((resolve) => { const tx = db.transaction('state'); const request = tx.objectStore('state').get('library'); request.onsuccess = () => resolve(request.result) })
    state.sources = [{ id: 'source', url: 'https://catalog.example/', lastChecked: new Date().toISOString() }]
    await new Promise((resolve) => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(state, 'library'); tx.oncomplete = resolve })
    db.close()
  })
  await page.reload()
  await page.getByLabel('Search your library').fill('New source video')
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await page.getByRole('dialog').getByText(/AI is unavailable; these are keyword matches/).waitFor()
  await page.getByRole('region', { name: 'AI search results' }).getByRole('button', { name: 'New source video', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Close search results' }).click()
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await page.getByLabel('AI gateway URL').fill('https://ai.example')
  await page.getByLabel('AI account username').fill('demo')
  await page.getByLabel('AI account password').fill('demo-password')
  await page.getByRole('button', { name: 'Connect AI' }).click()
  await page.getByText('Connected for this session.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'home', exact: true }).click()
  await page.getByLabel('Search your library').fill('Create an animation channel')
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await page.getByRole('dialog').getByRole('heading', { name: 'Animation channel' }).waitFor()
  assert.match(await page.getByRole('region', { name: 'AI search results' }).innerText(), /1 matches/)
  await page.getByRole('region', { name: 'AI search results' }).getByRole('button', { name: 'New source video', exact: true }).waitFor()
  assert.equal(await page.getByRole('region', { name: 'AI search results' }).locator('img').count(), 1)
  await page.getByText('Animation favorites', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Create playlist & start channel' }).click()
  await page.getByRole('button', { name: 'channels', exact: true }).click()
  await page.getByRole('region', { name: 'Channel guide' }).getByRole('button', { name: 'Animation channel' }).waitFor()
  console.log('AI search preview showed a source poster and created a channel on request using a mocked gateway')
} finally { await context.close(); await browser.close() }


