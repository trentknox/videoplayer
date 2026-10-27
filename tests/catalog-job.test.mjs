import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceCatalogJob } from '../src/catalogJob.ts'

test('catalog sections are queued once and followed after pagination finishes', () => {
  const root = 'https://example.com/'
  let job = { current: root, pending: [], seen: [root] }
  const sections = [{ url: 'https://example.com/movies' }, { url: 'https://example.com/shows' }, { url: 'https://elsewhere.example/films' }]
  job = advanceCatalogJob(root, job, 'https://example.com/page/2', sections)
  assert.equal(job.current, 'https://example.com/page/2')
  assert.deepEqual(job.pending, ['https://example.com/movies', 'https://example.com/shows'])
  job = advanceCatalogJob(root, job, undefined, sections)
  assert.equal(job.current, 'https://example.com/movies')
  job = advanceCatalogJob(root, job, undefined, sections)
  assert.equal(job.current, 'https://example.com/shows')
  job = advanceCatalogJob(root, job, undefined, sections)
  assert.equal(job.current, undefined)
})

test('series names and more than one hundred sections survive a paused scan', () => {
  const root = 'https://example.com/'
  const sections = Array.from({ length: 125 }, (_, i) => ({ url: `https://example.com/show/${i}`, series: `Series ${i}` }))
  const job = advanceCatalogJob(root, { current: root, pending: [], seen: [root] }, root, sections)
  assert.equal(job.pending.length, 125)
  assert.equal(job.seriesNames['https://example.com/show/124'], 'Series 124')
})
