import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage()
try {
 await page.addInitScript(()=>{window.__attempts=0;HTMLMediaElement.prototype.play=function(){window.__attempts++;return window.__attempts===1?Promise.reject(new DOMException('blocked','NotAllowedError')):Promise.resolve()}})
 await page.goto('http://127.0.0.1:4181/');await page.getByLabel('Search your library').waitFor();await page.waitForTimeout(1000)
 await page.getByRole('button',{name:'playlists',exact:true}).click();await page.getByPlaceholder('New playlist name').fill('Autoplay test');await page.getByRole('button',{name:'Create playlist',exact:true}).click()
 await page.locator('.playlist-card').filter({has:page.getByRole('heading',{name:'Autoplay test'})}).getByRole('button',{name:'Create channel'}).click()
 const video=page.locator('video.media-video');await video.waitFor();await video.evaluate(el=>el.dispatchEvent(new Event('canplay')))
 await page.getByText('Playback started muted.',{exact:false}).waitFor();assert.equal(await video.evaluate(el=>el.muted),true);assert.equal(await page.evaluate(()=>window.__attempts),2)
 console.log('When audible autoplay is blocked, direct video starts muted with a clear unmute notice')
} finally {await browser.close()}
