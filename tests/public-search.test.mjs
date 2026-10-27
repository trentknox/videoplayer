import assert from 'node:assert/strict'
import { test } from 'node:test'
import { searchPublicSources, sourceSearchTerms } from '../src/publicSearch.ts'

test('direct source search uses a same-origin public form with cleaned query terms', async () => {
  const seen = []
  const analyze = async (url) => {
    seen.push(url)
    if (url === 'https://catalog.example/') return { provider: 'embed', kind: 'catalog', sourceUrl: url, embedUrl: url, title: 'Catalog', searchForm: { url: 'https://catalog.example/search', parameter: 'keyword' } }
    return { provider: 'embed', kind: 'catalog', sourceUrl: url, embedUrl: url, title: 'Results', listings: [{ url: 'https://catalog.example/watch/john-wick', title: 'John Wick' }] }
  }
  const result = await searchPublicSources([{ id: 's', url: 'https://catalog.example/' }], 'Create a 24/7 John Wick channel', analyze)
  assert.equal(sourceSearchTerms('Create a 24/7 John Wick channel'), 'John Wick')
  assert.equal(new URL(seen[1]).searchParams.get('keyword'), 'John Wick')
  assert.equal(result.listings[0].title, 'John Wick')
  assert.equal(result.searched, 1)
})

test('cross-origin forms and sources without a public search are not queried', async () => {
  const analyze = async (url) => ({ provider: 'embed', kind: 'catalog', sourceUrl: url, embedUrl: url, title: 'Catalog', searchForm: { url: 'https://other.example/search', parameter: 'q' } })
  const result = await searchPublicSources([{ id: 's', url: 'https://catalog.example/' }], 'Example', analyze)
  assert.equal(result.searched, 0)
  assert.equal(result.unavailable, 1)
})

test('source search follows an exact same-site cast link to find filmography', async () => {
  const calls=[]
  const analyze=async (url) => {
    calls.push(url)
    const base={provider:'embed',kind:'catalog',sourceUrl:url,embedUrl:url,title:'Page'}
    if(url==='https://catalog.example/') return {...base,searchForm:{url:'https://catalog.example/search',parameter:'keyword'}}
    if(url.startsWith('https://catalog.example/search')) return {...base,listings:[{url:'https://catalog.example/documentary',title:'Keanu Reeves documentary'}]}
    if(url==='https://catalog.example/documentary') return {...base,people:[{name:'Keanu Reeves',url:'https://catalog.example/actor/keanu'}]}
    if(url==='https://catalog.example/actor/keanu') return {...base,listings:[{url:'https://catalog.example/matrix',title:'The Matrix'},{url:'https://catalog.example/wick',title:'John Wick'}]}
    throw new Error('Unexpected URL')
  }
  const result=await searchPublicSources([{id:'source',url:'https://catalog.example/'}],'Keanu Reeves',analyze)
  assert.equal(result.listings.length,3)
  assert.deepEqual(result.listings.find(item=>item.title==='The Matrix').actors,['Keanu Reeves'])
  assert.ok(calls.includes('https://catalog.example/actor/keanu'))
})

test('actor expansion refuses a cross-origin cast link', async () => {
  const calls=[]
  const analyze=async (url) => {
    calls.push(url);const base={provider:'embed',kind:'catalog',sourceUrl:url,embedUrl:url,title:'Page'}
    if(url==='https://catalog.example/')return {...base,searchForm:{url:'https://catalog.example/search',parameter:'keyword'}}
    if(url.startsWith('https://catalog.example/search'))return {...base,listings:[{url:'https://catalog.example/doc',title:'Person document'}]}
    return {...base,people:[{name:'Keanu Reeves',url:'https://other.example/actor'}]}
  }
  await searchPublicSources([{id:'source',url:'https://catalog.example/'}],'Keanu Reeves',analyze)
  assert.ok(!calls.some(url=>url.startsWith('https://other.example/')))
})
