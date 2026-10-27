import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage()
try {
 let inferred = false
 await page.route('https://ai.example/**', async route => {
   const request = route.request(); const path = new URL(request.url()).pathname
   const headers = {'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,PUT,POST,OPTIONS'}
   if (request.method() === 'OPTIONS') return route.fulfill({status:204,headers})
   if (path === '/v1/infer') { const body = request.postDataJSON(); const library = JSON.parse(body.messages[1].content).library; const first = library.find(item => item.title === 'John Wick'); inferred = true; return route.fulfill({json:{text:JSON.stringify({name:'John Wick channel',ids:first ? [first.id] : [],suggestions:[]})},headers}) }
   if (path === '/v1/state') return route.fulfill({json:request.method() === 'GET' ? {revision:0,state:null} : {revision:1},headers})
   return route.fulfill({json:{tokens:[]},headers})
 })
 await page.route('**/api/analyze',async route=>{const u=route.request().postDataJSON().url;const url=new URL(u);const root={provider:'embed',kind:'catalog',sourceUrl:u,embedUrl:u,title:'Catalog'};if(url.pathname==='/')return route.fulfill({json:{...root,searchForm:{url:'https://catalog.example/search',parameter:'keyword'}}});if(url.pathname==='/search')return route.fulfill({json:{...root,listings:['John Wick','John Wick Chapter 2','John Wick Chapter 3','John Wick Chapter 4','The Continental John Wick'].map((title,i)=>({url:`https://catalog.example/watch-movie/${i}`,title}))}});return route.fulfill({json:{...root,kind:'video',embedUrl:'https://video.example/player',durationSeconds:6000+Number(url.pathname.split('/').pop())*100}})})
 await page.goto('http://127.0.0.1:4181/');await page.getByLabel('Search your library').waitFor(); await page.waitForTimeout(1000)
 await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});const state=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result)});state.sources=[{id:'test',url:'https://catalog.example/',lastChecked:new Date().toISOString()}];await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'library');tx.oncomplete=resolve});db.close()})
 await page.evaluate(() => localStorage.setItem('vivid-ai-session', JSON.stringify({endpoint:'https://ai.example',token:'test-session'})))
 await page.reload(); await page.getByLabel('Search your library').fill('john wick'); await page.getByRole('button',{name:/Ask AI/}).click()
 try { await page.getByRole('dialog').getByText(/5 selected of 5 matches/).waitFor({timeout:20000}) } catch (e) { console.log('Dialog:', await page.getByRole('dialog').innerText()); throw e }
 await page.getByRole('button',{name:/Ask AI/}).waitFor({state:'visible',timeout:20000}); assert.ok(inferred, 'AI returned a partial selection before source matches were combined')
 await page.getByLabel('Include The Continental John Wick').uncheck()
 await page.getByRole('dialog').getByText(/4 selected of 5 matches/).waitFor()
 await page.getByRole('button',{name:'Create playlist & start channel'}).click()
 await page.locator('.player-toolbar').waitFor(); await page.waitForTimeout(1600)
 const saved=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});return await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve({media:r.result.media,playlist:r.result.playlists[0],channel:r.result.channels[0]})})})
 assert.equal(saved.playlist.mediaIds.length,4);assert.equal(saved.channel.playlistId,saved.playlist.id)
 assert.ok(saved.playlist.mediaIds.every(id=>!saved.media.find(m=>m.id===id).title.includes('Continental')))
 assert.ok(saved.playlist.mediaIds.every(id=>saved.media.find(m=>m.id===id).durationSeconds >= 6000), 'Each queued movie uses its public runtime')
 console.log('Four selected films saved to an opened channel; excluded series omitted')
} finally {await browser.close()}

