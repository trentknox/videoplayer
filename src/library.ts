import type { LibraryState } from './types'

const DATABASE = 'vivid-media-library'
const STORE = 'state'
const KEY = 'library'

const defaultState: LibraryState = {
  media: [
    {
      id: 'big-buck-bunny',
      provider: 'direct',
      kind: 'video',
      sourceUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      embedUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      title: 'Big Buck Bunny',
      description: 'A public sample video used to verify direct playback.',
      durationSeconds: 596,
      tags: ['sample', 'animation', 'public-domain'],
      actors: [],
      addedAt: new Date().toISOString(),
      importMode: 'single',
    },
  ],
  playlists: [
    { id: 'watch-later', name: 'Watch later', mediaIds: [], createdAt: new Date().toISOString() },
  ],
  channels: [],
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getValue<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

async function putValue<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadLibrary(): Promise<LibraryState> {
  try {
    return (await getValue<LibraryState>(KEY)) ?? defaultState
  } catch {
    const local = window.localStorage.getItem(KEY)
    return local ? JSON.parse(local) as LibraryState : defaultState
  }
}

export async function saveLibrary(state: LibraryState): Promise<void> {
  try {
    await putValue(KEY, state)
  } catch {
    window.localStorage.setItem(KEY, JSON.stringify(state))
  }
}

export function exportLibrary(state: LibraryState): void {
  const redactUrl = (value: string): string => {
    try {
      const url = new URL(value)
      for (const key of ['token', 'sig', 'signature', 'key', 'auth', 'authorization', 'expires']) url.searchParams.delete(key)
      return url.toString()
    } catch {
      return value
    }
  }
  const safeState: LibraryState = {
    ...state,
    catalogCursors: undefined,
    media: state.media.map((item) => ({ ...item, sourceUrl: redactUrl(item.sourceUrl), embedUrl: redactUrl(item.embedUrl) })),
  }
  const blob = new Blob([JSON.stringify(safeState, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `vivid-library-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export async function importLibrary(file: File): Promise<LibraryState> {
  const parsed = JSON.parse(await file.text()) as LibraryState
  if (!Array.isArray(parsed.media) || !Array.isArray(parsed.playlists) || !Array.isArray(parsed.channels)) {
    throw new Error('That file is not a Vivid library export.')
  }
  return parsed
}
