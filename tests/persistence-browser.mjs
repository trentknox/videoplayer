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
 const card=page.locator('.playlist-card').filter({has:page.getByRole('heading',{name:'Persistence test'})})
 await card.getByRole('button',{name:'Create channel'}).click()
 await page.locator('.player-toolbar').waitFor()
 await page.getByRole('button',{name:'playlists',exact:true}).click()
 await page.getByRole('button',{name:'Delete Persistence test'}).click()
 assert.equal(await page.getByRole('heading',{name:'Persistence test'}).count(),0)
 await page.waitForTimeout(1200);await page.reload()
 await page.getByRole('button',{name:'playlists',exact:true}).click()
 assert.equal(await page.getByRole('heading',{name:'Persistence test'}).count(),0)
 await page.getByRole('button',{name:'channels',exact:true}).click()
 await page.getByRole('button',{name:'Persistence test',exact:true}).first().waitFor()
 console.log('Playlist channel starts; deletion persists after reload; channel remains')
} finally {await browser.close()}
