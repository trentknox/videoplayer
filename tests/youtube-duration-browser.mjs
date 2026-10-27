import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage()
try {
 await page.addInitScript(() => { window.YT={Player:class { constructor(_frame, options){setTimeout(()=>options.events.onStateChange({data:1}),30)} getDuration(){return 3900} getCurrentTime(){return 0} destroy(){} }} })
 await page.goto('http://127.0.0.1:4181/');await page.getByLabel('Search your library').waitFor()
 await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});const state=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result)});state.media=[{id:'yt-duration',title:'YouTube runtime',sourceUrl:'https://www.youtube.com/watch?v=test',embedUrl:'https://www.youtube-nocookie.com/embed/test',provider:'youtube',kind:'video',tags:[],actors:[],durationSeconds:900,addedAt:'2026-01-01T00:00:00Z'}];await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'library');tx.oncomplete=resolve});db.close()})
 await page.reload();await page.getByRole('button',{name:'library',exact:true}).click();await page.getByRole('button',{name:'Play YouTube runtime'}).click()
 await page.getByText('youtube · video · 1h 5m').waitFor();console.log('YouTube player reports its runtime to Vivid')
} finally { await browser.close() }
