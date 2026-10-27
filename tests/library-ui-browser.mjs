import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage()
try {
 await page.goto('http://127.0.0.1:4181/')
 await page.getByLabel('Search your library').waitFor()
 assert.equal(await page.getByRole('button',{name:'Search library',exact:true}).count(),0)
 await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});const state=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result)});const base={provider:'embed',kind:'video',tags:[],actors:[],durationSeconds:900,addedAt:'2026-01-01T00:00:00Z'};state.media=[{...base,id:'movie',sourceUrl:'https://catalog.example/watch-movie/one',embedUrl:'https://catalog.example/watch-movie/one',title:'One (2025)'},{...base,id:'series',sourceUrl:'https://catalog.example/watch-tv/two',embedUrl:'https://catalog.example/watch-tv/two',title:'Two (2020)'}];await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'library');tx.oncomplete=resolve});db.close()})
 await page.reload(); await page.getByRole('button',{name:'library',exact:true}).click()
 const importer=page.locator('details.import-card'); assert.equal(await importer.getAttribute('open'),null)
 await importer.locator('summary').first().click(); assert.equal(await importer.locator('details.import-advanced').getAttribute('open'),null)
 await page.locator('.library-filters select').nth(0).selectOption('movie')
 assert.equal(await page.locator('.library-view .media-card').count(),1); assert.match(await page.locator('.library-view .media-card').innerText(),/One/)
 await page.locator('.library-filters select').nth(3).selectOption('2025'); assert.equal(await page.locator('.library-view .media-card').count(),1)
 await page.getByRole('button',{name:'Clear',exact:true}).click();assert.equal(await page.locator('.library-view .media-card').count(),2)
 console.log('Home search, collapsed importer, and library type/year filters verified')
} finally {await browser.close()}


