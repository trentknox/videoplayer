import { chromium } from 'playwright'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage()
try {
 await page.goto('https://vivid-media-player.pages.dev/',{waitUntil:'domcontentloaded'});await page.getByLabel('Search your library').waitFor();await page.waitForTimeout(1500)
 await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vivid-media-library',1);r.onsuccess=()=>resolve(r.result)});const state=await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('library');r.onsuccess=()=>resolve(r.result)});state.sources=[{id:'public-source',url:'https://1movies.stream/',lastChecked:new Date().toISOString()}];await new Promise(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'library');tx.oncomplete=resolve});db.close()})
 await page.reload();await page.getByLabel('Search your library').fill('keanu reeves');await page.getByRole('button',{name:/Ask AI/}).click()
 await page.getByRole('button',{name:'Save John Wick playlist'}).waitFor({timeout:30000})
 await page.getByRole('button',{name:'Save The Matrix playlist'}).waitFor({timeout:5000})
 console.log('Live Vivid actor search displayed both John Wick and Matrix playlist options')
} catch(e) {console.log('Dialog:',await page.getByRole('dialog').innerText().catch(()=>'(unavailable)'));throw e} finally {await browser.close()}
