import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage()
try {
 await page.goto('http://127.0.0.1:4181/');await page.getByLabel('Search your library').waitFor();await page.waitForTimeout(1000)
 await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});const state=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result)});state.media=[{id:'movie',title:'Demo movie',sourceUrl:'https://media.example/movie.mp4',embedUrl:'https://media.example/movie.mp4',provider:'direct',kind:'video',tags:[],actors:[],durationSeconds:1000,addedAt:'2026-01-01T00:00:00Z'}];state.playlists=[{id:'queue',name:'Movie queue',mediaIds:['movie'],createdAt:new Date().toISOString()}];state.channels=[{id:'live',name:'Live movies',filter:'',description:'',accent:'#000',anchor:new Date(Date.now()-120000).toISOString(),durationHours:24,playlistId:'queue'}];await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'library');tx.oncomplete=resolve});db.close()})
 await page.reload();await page.getByRole('button',{name:'channels',exact:true}).click();await page.getByRole('region',{name:'Channel guide'}).getByRole('button',{name:'Live movies'}).click()
 const video=page.locator('video.media-video');await video.waitFor()
 await video.evaluate(el=>{Object.defineProperty(el,'readyState',{value:3,configurable:true});Object.defineProperty(el,'currentTime',{value:120,writable:true,configurable:true});el.dispatchEvent(new Event('timeupdate'))})
 await video.evaluate(el=>{el.currentTime=30;el.dispatchEvent(new Event('timeupdate'))})
 await page.getByText('Rewound into the playlist.',{exact:false}).waitFor()
 await page.getByRole('heading',{name:'Movie queue'}).waitFor()
 const session=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('vivid-playback-session')))
 assert.equal(session.playlistId,'queue');assert.equal(session.channelId,undefined);assert.equal(session.position,30)
 console.log('Rewinding live direct playback switches to its playlist at the requested position')
} finally {await browser.close()}
