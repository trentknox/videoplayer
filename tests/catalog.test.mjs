import assert from 'node:assert/strict'
import { test } from 'node:test'
import { onRequestPost, onRequestOptions } from '../functions/api/analyze.ts'

test('desktop apps can preflight catalog analysis without sending credentials', () => {
  const response = onRequestOptions()
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.equal(response.headers.get('access-control-allow-credentials'), null)
})

test('a public listing page discovers distinct same-site titled entries', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(`<!doctype html><title>Example catalog</title>
    <a href="/films/one" title="Film One"><img src="/one.jpg"></a>
    <a href="/films/two"><img alt="Film Two" src="/two.jpg"></a>
    <a href="/films/one" title="Duplicate">Again</a>
    <a href="https://other.example/film" title="Other site">External</a>`, { headers: { 'content-type': 'text/html' } })
  try {
    const request = new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://catalog.example/' }) })
    const response = await onRequestPost({ request })
    const result = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(result.listings.map((item) => [item.title, item.url]), [
      ['Film One', 'https://catalog.example/films/one'],
      ['Film Two', 'https://catalog.example/films/two'],
    ])
    assert.equal(result.listings[0].poster, 'https://catalog.example/one.jpg')
  } finally { globalThis.fetch = originalFetch }
})

test('a landing page can point to a same-origin catalog page', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('<a href="/home">Go to homepage</a>', { headers: { 'content-type': 'text/html' } })
  try {
    const request = new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://catalog.example/' }) })
    const result = await (await onRequestPost({ request })).json()
    assert.equal(result.suggestedCatalogUrl, 'https://catalog.example/home')
  } finally { globalThis.fetch = originalFetch }
})

test('embedded videos are classified as videos while ordinary page URLs are not', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('<script type="application/ld+json">{"@type":"VideoObject","url":"https://fcc.gov/article","embedUrl":"https://video.example/player"}</script>', { headers: { 'content-type': 'text/html' } })
  try {
    const request = new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://fcc.gov/article' }) })
    const response = await onRequestPost({ request })
    const result = await response.json()
    assert.equal(response.status, 200)
    assert.equal(result.kind, 'video')
    assert.equal(result.embedUrl, 'https://video.example/player')
  } finally { globalThis.fetch = originalFetch }
})

test('IPv4-mapped IPv6 addresses are rejected before fetching', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Should not fetch a private address') }
  try {
    const request = new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'http://[::ffff:7f00:1]/' }) })
    assert.equal((await onRequestPost({ request })).status, 400)
  } finally { globalThis.fetch = originalFetch }
})
