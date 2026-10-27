import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage()
try {
 await page.goto('http://127.0.0.1:4181/');await page.getByLabel('Search your library').waitFor();await page.waitForTimeout(1000)
 await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});const state=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result)});const b={provider:'embed',kind:'video',tags:[],actors:[],durationSeconds:900,addedAt:'2026-01-01T00:00:00Z',rating:8};state.media=[{...b,id:'film',title:'A new film',sourceUrl:'https://example.test/watch-movie/a',embedUrl:'https://example.test/watch-movie/a',year:2026},{...b,id:'show',title:'A new show',sourceUrl:'https://example.test/watch-series/b',embedUrl:'https://example.test/watch-series/b',year:2025}];await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'library');tx.oncomplete=resolve});db.close()})
 await page.reload();await page.getByRole('heading',{name:'Latest Movies'}).waitFor();await page.getByRole('heading',{name:'Latest TV Shows'}).waitFor();await page.getByRole('heading',{name:'Trending'}).waitFor()
 assert.equal(await page.getByText('Find something to watch').count(),0)
 assert.equal(await page.getByLabel('Search your library').isVisible(),true)
 assert.equal(await page.getByText('Trending data is not available from your sources yet.',{exact:false}).isVisible(),true)
 const texts=await page.locator('.home-gallery .media-grid').allInnerTexts()
 assert.match(texts[1],/A new film/);assert.doesNotMatch(texts[1],/A new show/)
 assert.match(texts[2],/A new show/);assert.doesNotMatch(texts[2],/A new film/)
 console.log('Home shows compact Trending, Latest Movies and Latest TV Shows galleries without the intro block')
} finally {await browser.close()}
