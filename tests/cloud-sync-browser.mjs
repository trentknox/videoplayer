import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
let revision = 0
let state = null
try {
  await page.route('https://ai.example/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let status = 200, payload = { ok: true }
    if (path === '/v1/login') payload = { token: 'session-123', role: 'owner' }
    else if (path === '/v1/bot-tokens') payload = { tokens: [] }
    else if (path === '/v1/state' && route.request().method() === 'GET') payload = { revision, state }
    else if (path === '/v1/state') {
      const body = route.request().postDataJSON()
      if (body.revision !== revision) { status = 409; payload = { error: 'revision_conflict' } }
      else { revision++; state = body.state; payload = { revision } }
    }
    await route.fulfill({ status, json: payload, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, PUT, POST, OPTIONS' } })
  })
  await page.route('**/api/analyze', async (route) => { const sourceUrl = route.request().postDataJSON().url; await route.fulfill({ json: { provider: 'embed', kind: 'catalog', sourceUrl, embedUrl: sourceUrl, title: 'Catalog', listings: [] } }) })
  await page.goto('http://127.0.0.1:4181/')
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await page.getByLabel('AI gateway URL').fill('https://ai.example')
  await page.getByLabel('AI account username').fill('demo')
  await page.getByLabel('AI account password').fill('demo-password')
  await page.getByRole('button', { name: 'Connect AI' }).click()
  await page.getByText('Private library synced', { exact: true }).waitFor({ timeout: 15000 })
  assert.ok(state?.media?.some((entry) => entry.id === 'big-buck-bunny'))
  state.sources = [{ id: 'from-agent', url: 'https://catalog.example/' }]
  revision++
  await page.getByRole('button', { name: 'Retry sync' }).click()
  await page.getByText('https://catalog.example/', { exact: true }).waitFor({ timeout: 15000 })
  await page.reload()
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await page.getByText('Connected for this session.', { exact: true }).waitFor()
  await page.getByText('https://catalog.example/', { exact: true }).waitFor()
  console.log('Private sync uploads local data, pulls an agent change and restores the session after reload')
} finally { await context.close(); await browser.close() }
