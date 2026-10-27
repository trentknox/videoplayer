import assert from 'node:assert/strict'
import { test } from 'node:test'
import { searchByKeywords } from '../src/aiSearch.ts'
const base={provider:'embed',kind:'video',sourceUrl:'https://example.test/',embedUrl:'https://example.test/',tags:[],actors:['Keanu Reeves'],durationSeconds:900,addedAt:'2026-01-01'}
test('actor filmography offers real matching franchise playlists',()=>{
 const media=['John Wick','John Wick: Chapter 2','John Wick: Chapter 3','John Wick: Chapter 4','The Matrix','The Matrix Reloaded','The Matrix Revolutions','The Continental'].map((title,i)=>({...base,id:String(i),title:title+' Watch Online Full Movie HD'}))
 const result=searchByKeywords('Keanu Reeves',media)
 const john=result.suggestions.find(x=>x.name==='John Wick')
 const matrix=result.suggestions.find(x=>x.name==='The Matrix')
 assert.deepEqual(john.ids,['0','1','2','3'])
 assert.deepEqual(matrix.ids,['4','5','6'])
 assert.ok(!john.ids.includes('7'))
})

test('actor results offer an everything channel and separate available media types',()=>{
 const media=[{...base,id:'1',title:'First',sourceUrl:'https://example.test/watch-movie/first'}, {...base,id:'2',title:'Second',sourceUrl:'https://example.test/watch-movie/second'}, {...base,id:'3',title:'Show one',sourceUrl:'https://example.test/watch-series/one'}, {...base,id:'4',title:'Show two',sourceUrl:'https://example.test/watch-series/two'}]
 const result=searchByKeywords('Keanu Reeves',media)
 assert.deepEqual(result.suggestions.find(x=>x.name==='Keanu Reeves — everything').ids,['1','2','3','4'])
 assert.deepEqual(result.suggestions.find(x=>x.name==='Keanu Reeves — movies').ids,['1','2'])
 assert.deepEqual(result.suggestions.find(x=>x.name==='Keanu Reeves — series').ids,['3','4'])
})
