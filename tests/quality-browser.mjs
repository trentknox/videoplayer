import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
try {
  await page.route('https://media.example/**', async (route) => {
    const master = route.request().url().endsWith('/master.m3u8')
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/vnd.apple.mpegurl' }, body: master ? '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720\nhigh.m3u8\n' : '#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10,\nsegment.ts\n#EXT-X-ENDLIST\n' })
  })
  await page.goto('http://127.0.0.1:4181/')
  await page.getByLabel('Source URL').fill('https://media.example/master.m3u8')
  await page.getByRole('button', { name: 'Analyze & import' }).click()
  const quality = page.getByLabel('Playback quality')
  await quality.waitFor({ timeout: 15000 })
  assert.deepEqual(await quality.locator('option').allTextContents(), ['Auto', '360p · 800 kbps', '720p · 2400 kbps'])
  await quality.selectOption('1')
  assert.equal(await quality.inputValue(), '1')
  console.log('HLS manifest exposes Auto and its available quality levels')
} finally { await context.close(); await browser.close() }
