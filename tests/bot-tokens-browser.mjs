import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
let tokenInfo
try {
  await page.route('https://ai.example/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    let payload = { ok: true }
    if (path === '/v1/login') payload = { token: 'test-session' }
    else if (path === '/v1/bot-tokens' && method === 'GET') payload = { tokens: tokenInfo ? [tokenInfo] : [] }
    else if (path === '/v1/bot-tokens' && method === 'POST') { const body = route.request().postDataJSON(); tokenInfo = { id: 'id1', name: body.name, scopes: body.scopes, createdAt: 1, expiresAt: 1800000000, revoked: false }; payload = { id: 'id1', token: 'vivid_bot_test_once', expiresAt: 1800000000 } }
    else if (path === '/v1/bot-tokens/revoke') tokenInfo.revoked = true
    await route.fulfill({ json: payload, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' } })
  })
  await page.goto('http://127.0.0.1:4181/')
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await page.getByLabel('AI gateway URL').fill('https://ai.example')
  await page.getByLabel('AI account username').fill('demo')
  await page.getByLabel('AI account password').fill('demo-password')
  await page.getByRole('button', { name: 'Connect AI' }).click()
  await page.getByText('Connected for this session.', { exact: true }).waitFor()
  await page.getByLabel('Token name').fill('Media agent')
  await page.getByLabel('Manage sources').check()
  await page.getByLabel('Manage playlists').check()
  await page.getByRole('button', { name: 'Generate token' }).click()
  assert.equal(await page.getByLabel('New bot token').inputValue(), 'vivid_bot_test_once')
  await page.locator('.bot-token-reveal').getByRole('button', { name: 'Dismiss', exact: true }).click()
  assert.equal(await page.getByLabel('New bot token').count(), 0)
  await page.getByRole('button', { name: 'Revoke', exact: true }).click()
  await page.getByText(/Media agent.*Revoked/).waitFor()
  console.log('Agent token settings create, reveal once, and revoke with a simulated gateway')
} finally { await context.close(); await browser.close() }

