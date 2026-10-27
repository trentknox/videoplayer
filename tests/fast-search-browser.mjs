import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage()
let sourceStarted=false
try {
 await page.route('**/api/analyze',async route=>{sourceStarted=true;await new Promise(resolve=>setTimeout(resolve,10000));await route.abort().catch(()=>{})})
 await page.goto('http://127.0.0.1:4181/');await page.getByLabel('Search your library').waitFor(); await page.waitForTimeout(1000)
 await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});const state=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result)});state.media=[{id:'one',title:'John Wick',sourceUrl:'https://catalog.example/watch-movie/one',embedUrl:'https://catalog.example/watch-movie/one',provider:'embed',kind:'catalog',tags:[],actors:[],durationSeconds:900,addedAt:'2026-01-01T00:00:00Z'}];state.sources=[{id:'source',url:'https://catalog.example/',lastChecked:new Date().toISOString()}];await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'library');tx.oncomplete=resolve});db.close()})
 await page.reload();await page.getByLabel('Search your library').fill('john wick');const start=Date.now();await page.getByRole('button',{name:/Ask AI/}).click()
 try { await page.getByRole('dialog').getByRole('button',{name:'John Wick',exact:true}).waitFor({timeout:4000}) } catch (e) { console.log('Dialog:',await page.getByRole('dialog').innerText()); throw e }
 assert.ok(sourceStarted);assert.ok(Date.now()-start<4000);console.log('Existing match appears immediately while source request is pending')
} finally {await browser.close()}

