import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage()
try {
 await page.route('**/api/analyze',async route=>{const u=route.request().postDataJSON().url;const url=new URL(u);const base={provider:'embed',kind:'catalog',sourceUrl:u,embedUrl:u,title:'Catalog'};if(url.pathname==='/')return route.fulfill({json:{...base,searchForm:{url:'https://catalog.example/search',parameter:'keyword'}}});if(url.pathname==='/search')return route.fulfill({json:{...base,listings:[{url:'https://catalog.example/doc',title:'Keanu Reeves documentary'}]}});if(url.pathname==='/doc')return route.fulfill({json:{...base,people:[{name:'Keanu Reeves',url:'https://catalog.example/actor/keanu'}]}});if(url.pathname==='/actor/keanu')return route.fulfill({json:{...base,listings:['John Wick','John Wick Chapter 2','John Wick Chapter 3','John Wick Chapter 4','The Matrix','The Matrix Reloaded','The Matrix Revolutions','The Matrix Resurrections'].map((title,i)=>({url:`https://catalog.example/watch-movie/${i}`,title}))}});return route.fulfill({json:{...base,analysisUnavailable:true}})})
 await page.goto('http://127.0.0.1:4181/');await page.getByLabel('Search your library').waitFor();await page.waitForTimeout(1000)
 await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});const state=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result)});state.sources=[{id:'test',url:'https://catalog.example/',lastChecked:new Date().toISOString()}];await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'library');tx.oncomplete=resolve});db.close()})
 await page.reload();await page.getByLabel('Search your library').fill('keanu reeves');await page.getByRole('button',{name:/Ask AI/}).click()
 await page.getByRole('button',{name:'Save John Wick playlist'}).waitFor({timeout:20000})
 await page.getByRole('button',{name:'Save The Matrix playlist'}).waitFor()
 await page.getByRole('button',{name:'Save John Wick playlist'}).click()
 await page.getByRole('heading',{name:'John Wick',exact:true}).waitFor()
 const card=page.locator('.playlist-card').filter({has:page.getByRole('heading',{name:'John Wick',exact:true})})
 assert.match(await card.innerText(),/4 saved titles/)
 console.log('Actor search presents distinct John Wick and Matrix playlist options; John Wick saves four titles')
} finally {await browser.close()}
