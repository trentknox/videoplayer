import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gatewayUrl, searchWithAi, searchByKeywords } from '../src/aiSearch.ts'

test('gateway requires HTTPS except for loopback and rejects embedded credentials', () => {
  assert.equal(gatewayUrl('https://example.test/proxy/'), 'https://example.test/proxy')
  assert.equal(gatewayUrl('http://127.0.0.1:3020'), 'http://127.0.0.1:3020')
  assert.throws(() => gatewayUrl('http://example.test'))
  assert.throws(() => gatewayUrl('https://name:pass@example.test'))
})

test('AI can select only supplied IDs and cannot create an unrequested channel', async () => {
  const oldFetch = globalThis.fetch
  let request
  globalThis.fetch = async (_url, options) => { request = options; const first = JSON.parse(JSON.parse(options.body).messages[1].content).library[0].id; return new Response(JSON.stringify({ text: JSON.stringify({ name: 'Test', action: 'channel', ids: [first, 'fake', first] }) }), { status: 200 }) }
  try {
    const media = [{ id: 'a', title: 'A', tags: [], actors: [] }, { id: 'b', title: 'B', tags: [], actors: [] }]
    const result = await searchWithAi({ endpoint: 'https://example.test', token: 'session' }, 'Find something', media)
    assert.deepEqual(result.ids, ['a'])
    assert.equal(result.action, 'search')
    assert.equal(request.redirect, 'error')
    assert.equal((await searchWithAi({ endpoint: 'https://example.test', token: 'session' }, 'Make a channel', media)).action, 'channel')
  } finally { globalThis.fetch = oldFetch }
})

test('keyword fallback matches actor metadata and identifies channel requests', () => {
  const media = [
    { id: 'a', title: 'The Matrix', actors: ['Keanu Reeves'], tags: [], franchise: 'The Matrix' },
    { id: 'b', title: 'Unrelated', actors: ['Another Actor'], tags: [] },
  ]
  const result = searchByKeywords('Generate a 24/7 Keanu Reeves channel', media)
  assert.deepEqual(result.ids, ['a'])
  assert.equal(result.action, 'channel')
  assert.equal(result.suggestions[0].name, 'The Matrix')
})

test('AI uses compact IDs and maps a large curated response back to library IDs', async () => {
 const previous=globalThis.fetch
 const media=Array.from({length:82},(_,i)=>({id:`media-${i}-12345678-1234-1234-1234-123456789012`,title:`Film ${i}`,tags:[],actors:['Kevin Hart']}))
 globalThis.fetch=async (_url,options)=>{
  const body=JSON.parse(options.body), entries=JSON.parse(body.messages[1].content).library
  assert.equal(entries.length,82); assert.ok(entries.every(x=>/^v\d+$/.test(x.id))); assert.equal(body.max_tokens,1024)
  return new Response(JSON.stringify({text:JSON.stringify({name:'All films',ids:entries.map(x=>x.id),suggestions:[{name:'First two',ids:[entries[0].id,entries[1].id]}]})}),{status:200})
 }
 try {const result=await searchWithAi({endpoint:'https://example.test',token:'session'},'Kevin Hart',media);assert.deepEqual(result.ids,media.map(item=>item.id));assert.deepEqual(result.suggestions[0].ids,media.slice(0,2).map(item=>item.id))} finally {globalThis.fetch=previous}
})
