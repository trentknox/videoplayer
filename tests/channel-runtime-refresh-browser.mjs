import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage()
try {
 await page.route('**/api/analyze',async route=>{const u=route.request().postDataJSON().url;return route.fulfill({json:{provider:'embed',kind:'video',sourceUrl:u,embedUrl:'https://video.example/player',title:'Movie',durationSeconds:6000}})})
 await page.goto(process.env.VIVID_TEST_URL || 'http://127.0.0.1:4181/');await page.getByLabel('Search your library').waitFor();await page.waitForTimeout(1000)
 await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});const state=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result)});state.media=Array.from({length:25},(_,i)=>({id:`movie-${i}`,title:`Movie ${i}`,sourceUrl:`https://catalog.example/watch-movie/${i}`,embedUrl:`https://catalog.example/watch-movie/${i}`,provider:'embed',kind:'catalog',tags:[],actors:[],durationSeconds:1800,durationEstimated:true,addedAt:new Date().toISOString()}));state.playlists=[{id:'queue',name:'Queue',mediaIds:state.media.map(x=>x.id),createdAt:new Date().toISOString()}];state.channels=[{id:'live',name:'Live',filter:'',description:'',accent:'#000',anchor:new Date().toISOString(),durationHours:24,playlistId:'queue'}];await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'library');tx.oncomplete=resolve});db.close()})
 await page.reload();await page.getByRole('button',{name:'channels',exact:true}).click();await page.getByRole('region',{name:'Channel guide'}).getByRole('button',{name:'Live',exact:true}).click()
 await page.waitForFunction(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});return await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result.media.filter(item=>item.durationSeconds===6000).length===25)})},null,{timeout:20000})
 console.log('Tuning an existing channel refreshes runtimes beyond the first 20 titles')
} finally {await browser.close()}
