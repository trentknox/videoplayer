import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readPlayback, saveSelection, saveProgress } from '../src/playbackSession.ts'
const makeStorage = () => { const map = new Map(); return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) } }

test('playback session retains selection and position but ignores stale progress', () => {
  const storage = makeStorage()
  saveSelection(storage, { mediaId: 'first', playlistId: 'queue' })
  saveProgress(storage, 'first', 45.5)
  assert.deepEqual(readPlayback(storage), { mediaId: 'first', position: 45.5, playlistId: 'queue', channelId: undefined })
  saveSelection(storage, { mediaId: 'second', channelId: 'channel' })
  saveProgress(storage, 'first', 90)
  assert.deepEqual(readPlayback(storage), { mediaId: 'second', position: 0, playlistId: undefined, channelId: 'channel' })
})
