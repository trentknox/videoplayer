import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage()
try {
 await page.goto('http://127.0.0.1:4181/');await page.getByLabel('Search your library').waitFor()
 await page.getByRole('button',{name:'playlists',exact:true}).click()
 await page.getByPlaceholder('New playlist name').fill('Persistence test')
 await page.getByRole('button',{name:'Create playlist',exact:true}).click()
 await page.getByRole('heading',{name:'Persistence test'}).waitFor()
 await page.waitForTimeout(1000); await page.reload()
 await page.getByRole('button',{name:'playlists',exact:true}).click()
 await page.getByRole('heading',{name:'Persistence test'}).waitFor()
 console.log('Playlist remains after page reload in same browser profile')
} finally {await browser.close()}
