import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
try {
  await page.route('https://ai.example/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const payload = path === '/v1/login' ? { token: 'test-session' } : path === '/v1/infer' ? { text: JSON.stringify({ name: 'Animation channel', ids: ['big-buck-bunny', 'unknown'], action: 'channel' }) } : { ok: true }
    await route.fulfill({ json: payload, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS' } })
  })
  await page.goto('http://127.0.0.1:4181/')
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await page.getByLabel('AI gateway URL').fill('https://ai.example')
  await page.getByLabel('AI account username').fill('demo')
  await page.getByLabel('AI account password').fill('demo-password')
  await page.getByRole('button', { name: 'Connect AI' }).click()
  await page.getByText('Connected for this session.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'home', exact: true }).click()
  await page.getByLabel('Search your library').fill('Create an animation channel')
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await page.getByRole('region', { name: 'AI search results' }).getByText('Animation channel').waitFor()
  assert.match(await page.getByRole('region', { name: 'AI search results' }).innerText(), /1 matches/)
  await page.getByRole('button', { name: 'channels', exact: true }).click()
  await page.getByRole('region', { name: 'Channel guide' }).getByRole('button', { name: 'Animation channel' }).waitFor()
  console.log('AI search created a channel from validated catalog IDs using a mocked gateway')
} finally { await context.close(); await browser.close() }

