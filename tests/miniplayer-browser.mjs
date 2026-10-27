import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
try {
  await page.goto('http://127.0.0.1:4181/')
  const video = page.locator('video')
  await video.waitFor()
  await video.evaluate(async (element) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 24
    const ctx = canvas.getContext('2d')
    ctx.fillRect(0, 0, 24, 24)
    element.muted = true
    element.srcObject = canvas.captureStream(10)
    await element.play()
  })
  const original = await video.elementHandle()
  await page.getByRole('button', { name: 'Mini-player' }).click()
  assert.equal(await page.locator('.mini-player-grid').count(), 1)
  assert.equal(await original.evaluate((v) => v.isConnected && !v.paused), true)
  await page.getByRole('button', { name: 'library', exact: true }).click()
  assert.equal(await original.evaluate((v) => v.isConnected && !v.paused), true)
  assert.equal(await video.evaluate((v, old) => v === old, original), true)
  await page.getByRole('button', { name: 'Return to player' }).click()
  assert.equal(await original.evaluate((v) => v.isConnected && !v.paused), true)
  assert.equal(await page.locator('.mini-player-grid').count(), 0)
  console.log('The same playing video survives mini-player and navigation transitions')
} finally { await context.close(); await browser.close() }
