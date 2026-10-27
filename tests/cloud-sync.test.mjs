import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeShared, sharedLibrary } from '../src/cloudSync.ts'
const state = (media = [], playlists = []) => ({ media, playlists, channels: [], sources: [], history: [] })
const item = (id, title) => ({ id, title, provider: 'direct', kind: 'video', sourceUrl: 'https://example.test/' + id, embedUrl: 'https://example.test/' + id, durationSeconds: 60, tags: [], actors: [], addedAt: '2026-01-01', importMode: 'single' })

test('sync merges independent additions and propagates deletions without resurrecting items', () => {
  const base = state([item('a','A')])
  const local = state([item('a','A'), item('b','B')])
  const remote = state([item('a','A'), item('c','C')])
  const merged = mergeShared(base, local, remote)
  assert.deepEqual(new Set(merged.media.map((x) => x.id)), new Set(['a','b','c']))
  const removed = mergeShared(merged, state(merged.media.filter((x) => x.id !== 'a')), merged)
  assert.deepEqual(new Set(removed.media.map((x) => x.id)), new Set(['b','c']))
})

test('sync refuses conflicting edits and locked playlists', () => {
  const base = state([item('a','Original')])
  assert.throws(() => mergeShared(base, state([item('a','Local')]), state([item('a','Remote')])), /Conflicting/)
  assert.throws(() => mergeShared(null, state(), state([], [{ id: 'x', name: 'Locked', mediaIds: [], locked: true }])), /Unlock/)
})

test('sync excludes local scan cursors and source check times', () => {
  const state = { media: [], playlists: [], channels: [], sources: [{ id: 's', url: 'https://example.test/', lastChecked: 'today' }], catalogJobs: { s: {} } }
  const result = sharedLibrary(state)
  assert.equal(result.sources[0].lastChecked, undefined)
  assert.equal(result.catalogJobs, undefined)
})


test('sync refuses duplicate IDs instead of silently dropping data', () => {
  assert.throws(() => mergeShared(null, state([item('a','First'), item('a','Second')]), null), /duplicate IDs/)
})
