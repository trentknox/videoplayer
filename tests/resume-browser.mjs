import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const dir = mkdtempSync(join(tmpdir(), 'vivid-resume-test-'))
const fixture = join(dir, 'fixture.mp4')
const ffmpeg = 'C:/Users/trent/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe'
const made = spawnSync(ffmpeg, ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=10', '-t', '12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', fixture])
assert.equal(made.status, 0)
const bytes = readFileSync(fixture)
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext()
const page = await context.newPage()
try {
  await page.route('https://media.example/fixture.mp4', async (route) => {
    const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/)
    const start = range ? Number(range[1]) : 0
    const end = range && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1
    await route.fulfill({ status: range ? 206 : 200, headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*', ...(range ? { 'content-range': `bytes ${start}-${end}/${bytes.length}` } : {}) }, body: bytes.subarray(start, end + 1) })
  })
  await page.goto('http://127.0.0.1:4181/')
  await page.getByRole('button', { name: 'library', exact: true }).click()
  await page.getByLabel('Source URL').fill('https://media.example/fixture.mp4')
  await page.getByRole('button', { name: 'Analyze & import' }).click()
  await page.getByRole('button', { name: 'player', exact: true }).click()
  const video = page.locator('video[src="https://media.example/fixture.mp4"]')
  await video.waitFor()
  await page.waitForFunction(() => { const video = document.querySelector('video[src="https://media.example/fixture.mp4"]'); return video && video.readyState >= 1 })
  await video.evaluate(async (v) => { v.muted = true; await v.play(); v.pause(); v.currentTime = 5 })
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('vivid-playback-session') || '{}').position >= 4.9)
  await page.reload()
  const restored = page.locator('video[src="https://media.example/fixture.mp4"]')
  await restored.waitFor()
  await page.waitForFunction(() => { const v = document.querySelector('video[src="https://media.example/fixture.mp4"]'); return v && v.currentTime >= 4.9 }, { timeout: 15000 })
  assert.ok(await restored.evaluate((v) => v.currentTime) >= 4.9)
  console.log('A direct video remains selected and resumes near its saved position after reload')
} finally { await context.close(); await browser.close(); unlinkSync(fixture); rmdirSync(dir) }
