export interface PlaybackSession { mediaId: string; position: number; playlistId?: string; channelId?: string }
const key = 'vivid-playback-session'

export function readPlayback(storage: Storage): PlaybackSession | undefined {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null') as Partial<PlaybackSession> | null
    if (!value || typeof value.mediaId !== 'string' || !value.mediaId) return undefined
    return { mediaId: value.mediaId, position: typeof value.position === 'number' && Number.isFinite(value.position) && value.position >= 0 ? value.position : 0, playlistId: typeof value.playlistId === 'string' ? value.playlistId : undefined, channelId: typeof value.channelId === 'string' ? value.channelId : undefined }
  } catch { return undefined }
}

export function saveSelection(storage: Storage, selection: Omit<PlaybackSession, 'position'>): void {
  try {
    const previous = readPlayback(storage)
    storage.setItem(key, JSON.stringify({ ...selection, position: previous?.mediaId === selection.mediaId ? previous.position : 0 }))
  } catch { /* Browsing still works if session storage is unavailable. */ }
}

export function saveProgress(storage: Storage, mediaId: string, position: number): void {
  if (!Number.isFinite(position) || position < 0) return
  try {
    const current = readPlayback(storage)
    if (current?.mediaId === mediaId) storage.setItem(key, JSON.stringify({ ...current, position }))
  } catch { /* Browsing still works if session storage is unavailable. */ }
}
