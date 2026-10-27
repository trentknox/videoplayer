import assert from 'node:assert/strict'
import { test } from 'node:test'
import { posterSources } from '../src/posters.ts'

test('poster upgrades use recognized providers and retain original fallback', () => {
  assert.deepEqual(posterSources('https://image.tmdb.org/t/p/w185/abc.jpg'), ['https://image.tmdb.org/t/p/w780/abc.jpg', 'https://image.tmdb.org/t/p/w185/abc.jpg'])
  assert.deepEqual(posterSources('https://image.tmdb.org/t/p/w185/abc.jpg?sig=1'), ['https://image.tmdb.org/t/p/w185/abc.jpg?sig=1'])
  assert.deepEqual(posterSources('https://i.ytimg.com/vi/xyz/hqdefault.jpg', 'youtube', 'xyz'), ['https://i.ytimg.com/vi/xyz/maxresdefault.jpg', 'https://i.ytimg.com/vi/xyz/hqdefault.jpg'])
  assert.deepEqual(posterSources('https://example.com/t/p/w185/abc.jpg'), ['https://example.com/t/p/w185/abc.jpg'])
})
