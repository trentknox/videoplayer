import type { LibraryState } from './types'

const DATABASE = 'vivid-media-library'
const STORE = 'state'
const KEY = 'library'
const RECOVERY_KEY = 'vivid-library-recovery'
let saveQueue: Promise<void> = Promise.resolve()
const OLD_SAMPLE_URL = 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
const SAMPLE_URL = 'https://www.w3schools.com/html/mov_bbb.mp4'

const defaultState: LibraryState = {
  media: [
    {
      id: 'big-buck-bunny',
      provider: 'direct',
      kind: 'video',
      sourceUrl: SAMPLE_URL,
      embedUrl: SAMPLE_URL,
      title: 'Big Buck Bunny',
      description: 'A public sample video used to verify direct playback.',
      durationSeconds: 10,
      tags: ['sample', 'animation'],
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

export function migrateSample(state: LibraryState): LibraryState {
  return {
    ...state,
    media: state.media.map((item) => item.id === 'big-buck-bunny' && item.sourceUrl === OLD_SAMPLE_URL && item.embedUrl === OLD_SAMPLE_URL
      ? { ...item, sourceUrl: SAMPLE_URL, embedUrl: SAMPLE_URL, durationSeconds: 10 }
      : item),
  }
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
  // A fallback is written only after an IndexedDB failure, so it is newer than
  // the last successful database write and must take precedence on recovery.
  let recovery: string | null = null
  try { recovery = window.localStorage.getItem(RECOVERY_KEY) } catch { /* Storage may be disabled. */ }
  if (recovery) {
    try { return migrateSample(JSON.parse(recovery) as LibraryState) } catch { /* Try the database. */ }
  }
  try {
    const stored = await getValue<LibraryState>(KEY)
    if (stored) return migrateSample(stored)
  } catch { /* Try the older fallback below. */ }
  try {
    const local = window.localStorage.getItem(KEY)
    return migrateSample(local ? JSON.parse(local) as LibraryState : defaultState)
  } catch { return migrateSample(defaultState) }
}

export function saveLibrary(state: LibraryState): Promise<void> {
  // Preserve call order even if opening IndexedDB or committing a transaction is slow.
  const operation = saveQueue.catch(() => {}).then(async () => {
    try {
      await putValue(KEY, state)
      // If clearing an old recovery copy fails, write the latest state there instead.
      window.localStorage.removeItem(RECOVERY_KEY)
    } catch {
      // If this also fails, surface the failure to the UI rather than claiming a save.
      window.localStorage.setItem(RECOVERY_KEY, JSON.stringify(state))
    }
  })
  saveQueue = operation
  return operation
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
    catalogJobs: undefined,
    sources: state.sources?.map((source) => ({ ...source, url: redactUrl(source.url), lastChecked: undefined })),
    media: state.media.map((item) => ({ ...item, sourceUrl: redactUrl(item.sourceUrl), embedUrl: redactUrl(item.embedUrl), playerOptions: item.playerOptions?.map((option) => ({ ...option, url: redactUrl(option.url) })) })),
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
