import type { AiSession } from './aiSearch'
import type { LibraryState } from './types'

export interface SharedLibrary { media: LibraryState['media']; playlists: LibraryState['playlists']; channels: LibraryState['channels']; sources: NonNullable<LibraryState['sources']>; history: NonNullable<LibraryState['history']> }
export interface RemoteLibrary { revision: number; state: SharedLibrary | null }

export function sharedLibrary(state: LibraryState): SharedLibrary {
  return { media: state.media, playlists: state.playlists, channels: state.channels, sources: (state.sources ?? []).map(({ lastChecked: _lastChecked, ...entry }) => entry), history: state.history ?? [] }
}
const empty = (): SharedLibrary => ({ media: [], playlists: [], channels: [], sources: [], history: [] })
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export function mergeShared(baseValue: SharedLibrary | null, local: SharedLibrary, remote: SharedLibrary | null): SharedLibrary {
  const base = baseValue ?? empty(), other = remote ?? empty()
  const mergeRecords = <T extends { id: string }>(key: 'media' | 'playlists' | 'channels' | 'sources', before: T[], ours: T[], theirs: T[]): T[] => {
    for (const records of [before, ours, theirs]) {
      const ids = records.map((item) => item?.id)
      if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new Error(`Invalid or duplicate IDs in ${key}. Neither copy was overwritten.`)
    }
    const bm = new Map(before.map((x) => [x.id, x])), lm = new Map(ours.map((x) => [x.id, x])), rm = new Map(theirs.map((x) => [x.id, x]))
    const order = [...new Set([...theirs.map((x) => x.id), ...ours.map((x) => x.id), ...before.map((x) => x.id)])]
    const result: T[] = []
    for (const id of order) {
      const b = bm.get(id), l = lm.get(id), r = rm.get(id)
      let value: T | undefined
      if (equal(l, r)) value = l
      else if (key === 'media' && id === 'big-buck-bunny' && !b && l && r) {
        const withoutAddedAt = (record: T) => { const { addedAt: _addedAt, ...rest } = record as T & { addedAt?: string }; return rest }
        if (!equal(withoutAddedAt(l), withoutAddedAt(r))) throw new Error('Conflicting changes to the sample video. Neither copy was overwritten.')
        value = r
      }
      else if (equal(l, b)) value = r
      else if (equal(r, b)) value = l
      else throw new Error(`Conflicting changes to ${key}. Neither copy was overwritten.`)
      if (value !== undefined) result.push(value)
    }
    return result
  }
  if (other.playlists.some((playlist) => 'locked' in playlist && playlist.locked)) throw new Error('Unlock server playlists before syncing this library.')
  let history: SharedLibrary['history']
  if (equal(local.history, other.history)) history = local.history
  else if (equal(local.history, base.history)) history = other.history
  else if (equal(other.history, base.history)) history = local.history
  else throw new Error('Conflicting changes to history. Neither copy was overwritten.')
  return { media: mergeRecords('media', base.media, local.media, other.media), playlists: mergeRecords('playlists', base.playlists, local.playlists, other.playlists), channels: mergeRecords('channels', base.channels, local.channels, other.channels), sources: mergeRecords('sources', base.sources, local.sources, other.sources), history }
}

export function applyShared(local: LibraryState, shared: SharedLibrary): LibraryState {
  const lastChecked = new Map((local.sources ?? []).map((source) => [source.id, source.lastChecked]))
  return { ...local, ...shared, sources: shared.sources.map((source) => ({ ...source, lastChecked: lastChecked.get(source.id) })) }
}

async function call<T>(session: AiSession, method: 'GET' | 'PUT', body?: unknown): Promise<T> {
  const payload = body ? JSON.stringify(body) : undefined
  if (payload && new Blob([payload]).size > 32 * 1024 * 1024) throw new Error('This library exceeds the current 32 MiB sync limit. Your local library has not been sent; export a backup from Settings.')
  let response: Response
  try {
    response = await fetch(`${session.endpoint}/v1/state`, { method, redirect: 'error', credentials: 'omit', headers: { Authorization: `Bearer ${session.token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) }, body: payload, signal: AbortSignal.timeout(20000) })
  } catch {
    throw new Error(session.endpoint.startsWith('http://127.0.0.1') || session.endpoint.startsWith('http://localhost') ? 'Cannot reach the private gateway. Check the SSH tunnel and allow local-network access for Vivid in Edge, then retry.' : 'Cannot reach the private gateway. Check its connection and retry.')
  }
  if (response.status === 409) throw new Error('The server changed during sync. Vivid will retry.')
  if (!response.ok) throw new Error(response.status === 403 ? 'Private library session expired or cannot sync.' : `Private library unavailable (HTTP ${response.status}).`)
  return response.json() as Promise<T>
}
export async function getRemoteLibrary(session: AiSession): Promise<RemoteLibrary> {
  const value = await call<RemoteLibrary>(session, 'GET')
  if (!Number.isInteger(value.revision) || value.revision < 0 || (value.state && !['media', 'playlists', 'channels'].every((key) => Array.isArray((value.state as unknown as Record<string, unknown>)[key])))) throw new Error('The private server returned an invalid library.')
  if (value.state) { if ((value.state.sources !== undefined && !Array.isArray(value.state.sources)) || (value.state.history !== undefined && !Array.isArray(value.state.history))) throw new Error('The private server returned an invalid library.'); value.state = { ...value.state, sources: value.state.sources ?? [], history: value.state.history ?? [] } }
  return value
}
export async function putRemoteLibrary(session: AiSession, revision: number, state: SharedLibrary): Promise<number> {
  const result = await call<{ revision: number }>(session, 'PUT', { revision, state })
  if (!Number.isInteger(result.revision) || result.revision <= revision) throw new Error('The private server returned an invalid revision.')
  return result.revision
}
