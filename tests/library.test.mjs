import assert from 'node:assert/strict'
import { test } from 'node:test'
import { migrateSample } from '../src/library.ts'

test('repairing the default sample preserves user items and playlists', () => {
  const old = 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
  const sample = { id: 'big-buck-bunny', sourceUrl: old, embedUrl: old, title: 'My sample', durationSeconds: 596 }
  const other = { id: 'other', sourceUrl: old, embedUrl: old }
  const state = { media: [sample, other], playlists: [{ id: 'one', mediaIds: [sample.id] }], channels: [] }
  const result = migrateSample(state)
  assert.equal(result.media[0].sourceUrl, 'https://www.w3schools.com/html/mov_bbb.mp4')
  assert.equal(result.media[0].title, 'My sample')
  assert.deepEqual(result.media[1], other)
  assert.deepEqual(result.playlists, state.playlists)
})
