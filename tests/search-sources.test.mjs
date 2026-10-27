import assert from 'node:assert/strict'
import { test } from 'node:test'
import { discoverForSearch } from '../src/searchSources.ts'

test('source discovery continues across searches and reports partial scans', async () => {
  const url = 'https://catalog.example/'
  const listings = Array.from({ length: 150 }, (_, i) => ({ url: `https://catalog.example/title-${i}`, title: `Title ${i}` }))
  const analyze = async () => ({ provider: 'embed', kind: 'catalog', sourceUrl: url, embedUrl: url, title: 'Catalog', listings })
  const sources = [{ id: 'source', url }]
  const first = await discoverForSearch(sources, [], {}, analyze)
  assert.equal(first.listings.length, 100)
  assert.equal(first.incomplete, true)
  assert.ok(first.jobs[url])
  const second = await discoverForSearch(sources, first.listings.map((entry) => entry.url), first.jobs, analyze)
  assert.equal(second.listings.length, 50)
  assert.equal(second.incomplete, false)
  assert.equal(second.jobs[url], undefined)
  assert.equal(second.listings[49].title, 'Title 149')
})

test('sources needing a provider API are reported as unavailable', async () => {
  const url = 'https://youtube.com/@example'
  const result = await discoverForSearch([{ id: 'youtube', url }], [], {}, async () => ({ provider: 'youtube', kind: 'channel', sourceUrl: url, embedUrl: url, title: 'Channel' }))
  assert.equal(result.incomplete, true)
  assert.equal(result.failed, 1)
})
