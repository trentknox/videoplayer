import assert from 'node:assert/strict'
import { test } from 'node:test'
import { movePlaylistItem } from '../src/playlist.ts'

test('playlist titles can move in either direction without mutating the saved order', () => {
  const original = ['first', 'second', 'third']
  assert.deepEqual(movePlaylistItem(original, 'second', -1), ['second', 'first', 'third'])
  assert.deepEqual(movePlaylistItem(original, 'second', 1), ['first', 'third', 'second'])
  assert.deepEqual(original, ['first', 'second', 'third'])
  assert.deepEqual(movePlaylistItem(original, 'first', -1), original)
  assert.deepEqual(movePlaylistItem(original, 'missing', 1), original)
})
