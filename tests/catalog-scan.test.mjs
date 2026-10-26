import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scanCatalog } from '../src/catalogScan.ts'

const page = (url, listings, nextCatalogUrl) => ({ provider: 'embed', kind: 'catalog', sourceUrl: url, embedUrl: url, title: 'Catalog', listings, nextCatalogUrl })
const entries = (from, count) => Array.from({ length: count }, (_, i) => ({ url: `https://catalog.example/title/${from + i}`, title: `Title ${from + i}` }))

test('resuming halfway through a page preserves unimported titles', async () => {
  const url = 'https://catalog.example/page/1'
  const all = entries(0, 40)
  const analyze = async () => page(url, all)
  const first = await scanCatalog(url, [], analyze)
  assert.equal(first.listings.length, 25)
  assert.equal(first.cursor, url)
  const second = await scanCatalog(first.cursor, first.listings.map((item) => item.url), analyze)
  assert.equal(second.listings.length, 15)
  assert.equal(second.cursor, undefined)
})

test('a scan continues after five pages and refuses cross-origin pagination', async () => {
  const start = 'https://catalog.example/page/1'
  const analyze = async (url) => {
    const number = Number(url.split('/').at(-1))
    return page(url, entries(number, 1), number === 6 ? 'https://other.example/page/7' : `https://catalog.example/page/${number + 1}`)
  }
  const first = await scanCatalog(start, [], analyze)
  assert.equal(first.listings.length, 5)
  assert.equal(first.cursor, 'https://catalog.example/page/6')
  const second = await scanCatalog(first.cursor, first.listings.map((item) => item.url), analyze)
  assert.equal(second.listings.length, 1)
  assert.equal(second.cursor, undefined)
})

test('unavailable analysis reports an error instead of silently advancing', async () => {
  const start = 'https://catalog.example/page/1'
  await assert.rejects(scanCatalog(start, [], async () => ({ ...page(start, []), analysisUnavailable: true })), /position is unchanged/)
})
