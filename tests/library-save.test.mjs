import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadLibrary, saveLibrary } from '../src/library.ts'

const store = new Map()
let saved
let failDb = false
let openings = 0
const localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) }
globalThis.window = { localStorage, indexedDB: { open() {
  const request = {}
  const delay = ++openings === 1 ? 25 : 0
  setTimeout(() => {
    if (failDb) { request.error = new Error('unavailable'); request.onerror?.(); return }
    request.result = { close() {}, transaction(_store, mode) {
      const tx = { objectStore() { return { put(value) { setTimeout(() => { saved = structuredClone(value); tx.oncomplete?.() }, mode === 'readwrite' ? 5 : 0) }, get() { const read = {}; setTimeout(() => { read.result = saved; read.onsuccess?.(); tx.oncomplete?.() }, 0); return read } } } }
      return tx
    } }
    request.onsuccess?.()
  }, delay)
  return request
} } }
const state = (name) => ({ media: [], playlists: [{ id: name, name, mediaIds: [], createdAt: '' }], channels: [] })

test('saves remain ordered and recover newer fallback after IndexedDB failure', async () => {
  await Promise.all([saveLibrary(state('first')), saveLibrary(state('second'))])
  assert.equal(saved.playlists[0].name, 'second')
  failDb = true
  await saveLibrary(state('fallback'))
  failDb = false
  assert.equal((await loadLibrary()).playlists[0].name, 'fallback')
  await saveLibrary(state('recovered'))
  assert.equal((await loadLibrary()).playlists[0].name, 'recovered')
  assert.equal(store.has('vivid-library-recovery'), false)
})
