import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dueSource } from '../src/sources.ts'

test('new sources refresh immediately, completed sources every six hours, and unfinished jobs after five minutes', () => {
  const source = { id: 'one', url: 'https://example.com/' }
  const now = Date.parse('2026-01-01T12:00:00Z')
  const state = { sources: [source], media: [], playlists: [], channels: [] }
  assert.equal(dueSource(state, now)?.id, 'one')
  source.lastChecked = new Date(now - 6 * 60_000).toISOString()
  assert.equal(dueSource(state, now), undefined)
  state.catalogJobs = { [source.url]: { current: source.url, pending: [], seen: [source.url] } }
  assert.equal(dueSource(state, now)?.id, 'one')
  delete state.catalogJobs
  source.lastChecked = new Date(now - 7 * 60 * 60_000).toISOString()
  assert.equal(dueSource(state, now)?.id, 'one')
})
