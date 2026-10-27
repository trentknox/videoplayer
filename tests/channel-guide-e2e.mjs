import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
try {
  await page.goto('http://127.0.0.1:4181/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'channels', exact: true }).click()
  for (const name of ['First channel', 'Second channel']) {
    await page.getByPlaceholder('Channel name').fill(name)
    await page.getByRole('button', { name: 'Launch 24/7 channel' }).click()
  }
  const guide = page.getByRole('region', { name: 'Channel guide' })
  assert.equal(await guide.locator('.guide-row').count(), 2)
  await guide.getByRole('button', { name: 'First channel' }).click()
  await page.locator('body').click({ position: { x: 4, y: 4 } })
  await page.keyboard.press('ArrowDown')
  await page.getByRole('status').getByText('Second channel is live now.').waitFor()
  console.log('Channel guide and keyboard surfing passed')
} finally { await context.close(); await browser.close() }
