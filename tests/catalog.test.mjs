import assert from 'node:assert/strict'
import { test } from 'node:test'
import { onRequestPost, onRequestOptions } from '../functions/api/analyze.ts'
import { scanCatalog } from '../src/catalogScan.ts'

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

test('catalog discovery identifies distinct same-site movies and series sections', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('<a href="/movies">Movies</a><a href="/shows">TV Shows</a><a href="/movies">Movies</a><a href="https://other.example/films">Films</a>', { headers: { 'content-type': 'text/html' } })
  try {
    const request = new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://catalog.example/' }) })
    const result = await (await onRequestPost({ request })).json()
    assert.deepEqual(result.catalogSections, [{ url: 'https://catalog.example/movies', title: 'Movies' }, { url: 'https://catalog.example/shows', title: 'TV Shows' }])
  } finally { globalThis.fetch = originalFetch }
})

test('episode links without posters retain season and episode numbers', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('<a href="/episode/show/s02-e03/" title="Episode 3: Example">Episode</a>', { headers: { 'content-type': 'text/html' } })
  try {
    const request = new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://catalog.example/show' }) })
    const result = await (await onRequestPost({ request })).json()
    assert.deepEqual(result.listings, [{ url: 'https://catalog.example/episode/show/s02-e03/', title: 'Episode 3: Example', season: 2, episode: 3 }])
  } finally { globalThis.fetch = originalFetch }
})

test('public play action yields an embed without accepting private player addresses', async () => {
  const originalFetch = globalThis.fetch
  const methods = []
  globalThis.fetch = async (url, options) => {
    methods.push(options.method || 'GET')
    if (options.method === 'POST') return new Response(JSON.stringify([{ link: 'http://127.0.0.1/private' }, { name: 'First', link: 'https://player.example/embed/123' }, { name: 'Second', link: 'https://other.example/embed/456' }]), { headers: { 'content-type': 'application/json' } })
    return new Response('<div id="series-player" data-token="public-identifier"></div>', { headers: { 'content-type': 'text/html' } })
  }
  try {
    const request = new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://1movies.stream/episode/example/s01-e01/' }) })
    const result = await (await onRequestPost({ request })).json()
    assert.equal(result.kind, 'video')
    assert.equal(result.embedUrl, 'https://player.example/embed/123')
    assert.deepEqual(result.playerOptions, [{ name: 'First', url: 'https://player.example/embed/123' }, { name: 'Second', url: 'https://other.example/embed/456' }])
    assert.deepEqual(methods, ['GET', 'POST'])
  } finally { globalThis.fetch = originalFetch }
})

test('movie pages use the public movie player action and extract structured filtering metadata', async () => {
  const originalFetch = globalThis.fetch
  let posted
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'POST') {
      posted = options.body
      return new Response(JSON.stringify([{ name: 'Primary', link: 'https://player.example/embed/movie' }]))
    }
    return new Response(`<div id="main-wrapper" data-token="public-id"></div><script type="application/ld+json">{"@type":"Movie","datePublished":"2024-01-01","genre":["Drama","Action"],"countryOfOrigin":{"name":"Canada"},"actor":[{"name":"Actor One"}],"aggregateRating":{"ratingValue":"8","bestRating":"10"},"budget":{"value":100,"currency":"USD"}}</script>`, { headers: { 'content-type': 'text/html' } })
  }
  try {
    const request = new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://1movies.stream/watch-movie/example/' }) })
    const result = await (await onRequestPost({ request })).json()
    assert.equal(posted.get('players'), 'public-id')
    assert.equal(result.embedUrl, 'https://player.example/embed/movie')
    assert.equal(result.contentType, 'movie')
    assert.deepEqual(result.genres, ['Drama', 'Action'])
    assert.deepEqual(result.countries, ['Canada'])
    assert.deepEqual(result.actors, ['Actor One'])
    assert.equal(result.year, 2024)
    assert.equal(result.rating, 8)
    assert.equal(result.budgetUsd, 100)
  } finally { globalThis.fetch = originalFetch }
})

test('large listing pages remain discoverable across successive import batches', async () => {
  const originalFetch = globalThis.fetch
  const html = Array.from({ length: 225 }, (_, i) => `<a href="/films/${i}" title="Film ${i}"><img src="/poster.jpg"></a>`).join('')
  globalThis.fetch = async () => new Response(html, { headers: { 'content-type': 'text/html' } })
  try {
    const source = 'https://catalog.example/'
    const analyze = async (url) => (await onRequestPost({ request: new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url }) }) })).json()
    const imported = []
    let cursor = source
    do {
      const batch = await scanCatalog(cursor, imported.map((item) => item.url), analyze)
      imported.push(...batch.listings)
      cursor = batch.cursor
    } while (cursor)
    assert.equal(imported.length, 225)
    assert.equal(imported.at(-1).url, 'https://catalog.example/films/224')
  } finally { globalThis.fetch = originalFetch }
})

test('pagination follows standard same-origin next links only', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('<link href="/catalog?page=2#top" rel="next">', { headers: { 'content-type': 'text/html' } })
    const request = () => new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://catalog.example/catalog?page=1' }) })
    assert.equal((await (await onRequestPost({ request: request() })).json()).nextCatalogUrl, 'https://catalog.example/catalog?page=2')
    globalThis.fetch = async () => new Response('<a rel="next" href="https://other.example/page">Next</a>', { headers: { 'content-type': 'text/html' } })
    assert.equal((await (await onRequestPost({ request: request() })).json()).nextCatalogUrl, undefined)
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

test('catalog thumbnails prefer the highest public srcset and lazy image sources', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(`<a href="/film/one" title="One"><img src="/placeholder.gif" data-src="/lazy.jpg" data-srcset="/small.jpg 200w, /large.jpg 1000w, http://127.0.0.1/private 3000w"></a><a href="/film/two" title="Two"><img src="/placeholder.gif" data-original="/original.jpg"></a>`, { headers: { 'content-type': 'text/html' } })
  try {
    const request = new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://catalog.example/' }) })
    const result = await (await onRequestPost({ request })).json()
    assert.deepEqual(result.listings.map((entry) => entry.poster), ['https://catalog.example/large.jpg', 'https://catalog.example/original.jpg'])
  } finally { globalThis.fetch = originalFetch }
})

test('catalog poster sibling is associated with its overlay link', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(`<div class="film-poster"><div class="pick">HD</div><img data-src="https://images.example/poster.webp" alt="Film One"><a href="/watch-movie/film-one" title="Film One"><i>Play</i></a></div>`, { headers: { 'content-type': 'text/html' } })
  try {
    const request = new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://catalog.example/movies' }) })
    const result = await (await onRequestPost({ request })).json()
    assert.equal(result.listings[0].poster, 'https://images.example/poster.webp')
  } finally { globalThis.fetch = originalFetch }
})

test('detects a same-origin public GET keyword search form and ignores unsafe forms', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(`<form action="https://other.example/search"><input name="q"></form><form action="/search" method="post"><input name="keyword"></form><form action="/search"><input type="text" name="keyword"></form>`, { headers: { 'content-type': 'text/html' } })
    const request = new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://catalog.example/' }) })
    const result = await (await onRequestPost({ request })).json()
    assert.deepEqual(result.searchForm, { url: 'https://catalog.example/search', parameter: 'keyword' })
  } finally { globalThis.fetch = originalFetch }
})

test('public metadata keeps real durations and does not invent one when absent', async () => {
  const originalFetch = globalThis.fetch
  try {
    const analyze = async (html) => {
      globalThis.fetch = async () => new Response(html, { headers: { 'content-type': 'text/html' } })
      return (await onRequestPost({ request: new Request('https://app.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://catalog.example/title' }) }) })).json()
    }
    assert.equal((await analyze('<script type="application/ld+json">{"@type":"Movie","duration":"PT2H11M32S"}</script>')).durationSeconds, 7892)
    assert.equal((await analyze('<script type="application/ld+json">{"@type":"VideoObject","duration":"PT42M","embedUrl":"https://video.example/player"}</script>')).durationSeconds, 2520)
    assert.equal((await analyze('<script type="application/ld+json">{"@type":"Movie","duration":"P2D"}</script>')).durationSeconds, undefined)
    assert.equal((await analyze('<title>Unknown runtime</title>')).durationSeconds, undefined)
  } finally { globalThis.fetch = originalFetch }
})

test('extracts public cast links and attributes ratings only to explicitly named providers', async () => {
  const originalFetch=globalThis.fetch
  try {
    globalThis.fetch=async()=>new Response(`<script type="application/ld+json">{"@type":"Movie","aggregateRating":{"ratingValue":81,"bestRating":100,"ratingCount":12345,"author":{"name":"Metacritic"}}}</script><div class="row-line"><span class="type">Casts:</span> <a href="/actor/keanu">Keanu Reeves</a>, <a href="https://other.example/actor">Other Person</a></div>`,{headers:{'content-type':'text/html'}})
    const request=new Request('https://app.example/api/analyze',{method:'POST',body:JSON.stringify({url:'https://catalog.example/title'})})
    const result=await (await onRequestPost({request})).json()
    assert.deepEqual(result.actors,['Keanu Reeves'])
    assert.deepEqual(result.people,[{name:'Keanu Reeves',url:'https://catalog.example/actor/keanu'}])
    assert.equal(result.metacriticScore,81)
    assert.equal(result.ratingCount,12345)
    assert.equal(result.imdbRating,undefined)
  } finally {globalThis.fetch=originalFetch}
})
