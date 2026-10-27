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
  globalThis.fetch = async (_url, options) => { request = options; return new Response(JSON.stringify({ text: JSON.stringify({ name: 'Test', action: 'channel', ids: ['a', 'fake', 'a'] }) }), { status: 200 }) }
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
