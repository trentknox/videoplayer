import type { LibraryState, SavedSource } from './types'

export function dueSource(state: LibraryState, now = Date.now()): SavedSource | undefined {
  return state.sources?.find((source) => {
    const last = source.lastChecked ? Date.parse(source.lastChecked) : 0
    const delay = state.catalogJobs?.[source.url] ? 5 * 60_000 : 6 * 60 * 60_000
    return !Number.isFinite(last) || !last || now - last >= delay
  })
}
