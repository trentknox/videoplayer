import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage()
try {
 await page.goto(process.env.VIVID_TEST_URL || 'http://127.0.0.1:4181/');await page.getByLabel('Search your library').waitFor();await page.waitForTimeout(1000)
 await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});const state=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result)});const base={provider:'direct',kind:'video',sourceUrl:'https://example.test/video.mp4',embedUrl:'https://example.test/video.mp4',tags:[],actors:['Test Actor'],durationSeconds:6000,addedAt:'2026-01-01T00:00:00Z'};state.media=[{...base,id:'low',title:'Lower revenue',contentType:'movie',revenueUsd:100,genres:['Comedy']},{...base,id:'high',title:'Higher revenue',contentType:'movie',revenueUsd:200,genres:['Comedy']},{...base,id:'show',title:'Series result',contentType:'series',revenueUsd:300,genres:['Drama']}];await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'library');tx.oncomplete=resolve});db.close()})
 await page.reload();await page.getByLabel('Search your library').fill('Test Actor');await page.getByRole('button',{name:/Ask AI/}).click()
 await page.getByRole('dialog').getByText(/3 total matches/).waitFor()
 await page.getByLabel('Search result type').selectOption('movie');await page.getByLabel('Search result genre').selectOption('Comedy');await page.getByLabel('Sort search results').selectOption('revenue')
 const visible=await page.locator('.ai-preview-play').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));assert.deepEqual(visible,['Higher revenue','Lower revenue'])
 await page.getByRole('button',{name:'Save playlist',exact:true}).click();await page.getByRole('heading',{name:'Test Actor',exact:true}).waitFor();await page.waitForTimeout(700)
 const ids=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});return await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result.playlists[0].mediaIds)})})
 assert.deepEqual(ids,['high','low']);console.log('Search filters sort by revenue and create a playlist using only filtered movies')
} finally {await browser.close()}
