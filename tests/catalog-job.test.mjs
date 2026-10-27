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
