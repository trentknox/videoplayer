import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page = await browser.newPage()
try {
 await page.goto('http://127.0.0.1:4181/'); await page.getByLabel('Search your library').waitFor()
 await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});const state=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result)});state.media=[{id:'duration-test',title:'Duration test',sourceUrl:'https://media.example/test.mp4',embedUrl:'https://media.example/test.mp4',provider:'direct',kind:'video',tags:[],actors:[],durationSeconds:900,addedAt:'2026-01-01T00:00:00Z'}];await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'library');tx.oncomplete=resolve});db.close()})
 await page.reload();await page.getByRole('button',{name:'library',exact:true}).click();await page.getByRole('button',{name:'Play Duration test'}).click()
 await page.locator('video').evaluate(video=>{Object.defineProperty(video,'duration',{value:7200,configurable:true});video.dispatchEvent(new Event('loadedmetadata'))})
 await page.getByText('direct · video · 2h').waitFor(); await page.waitForTimeout(800);await page.reload()
 const saved=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});return await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result.media[0].durationSeconds)})})
 assert.equal(saved,7200);console.log('Real player duration replaces estimated runtime and survives reload')
} finally {await browser.close()}
