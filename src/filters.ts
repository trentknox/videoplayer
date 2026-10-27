import type { MediaItem } from './types'

export interface LibraryFilters { query: string; type: string; genre: string; country: string; year: string; sort: 'added' | 'title' | 'year' | 'rating' | 'budget' | 'revenue'; order: 'asc' | 'desc' }
export const defaultFilters: LibraryFilters = { query: '', type: '', genre: '', country: '', year: '', sort: 'added', order: 'desc' }

export function mediaType(item: MediaItem): MediaItem['contentType'] {
  if (item.contentType) return item.contentType
  if (item.episode) return 'episode'
  try {
    const path = new URL(item.sourceUrl).pathname.toLowerCase()
    if (/\/(?:watch-movie|movie|movies)\//.test(path)) return 'movie'
    if (/\/(?:watch-tv|watch-series|tv|series|tv-show|tv-shows)\//.test(path)) return 'series'
  } catch { /* Unknown source types remain unclassified. */ }
  return undefined
}

export function mediaYear(item: MediaItem): number | undefined {
  if (item.year) return item.year
  const match = item.title.match(/\(((?:19|20)\d{2})\)/)
  return match ? Number(match[1]) : undefined
}

export function filterLibrary(items: MediaItem[], filters: LibraryFilters): MediaItem[] {
  const query = filters.query.trim().toLowerCase()
  const selected = items.filter((item) => {
    const text = [item.title, item.description, item.provider, item.franchise, item.series, item.season, item.episode, item.year, ...(item.genres ?? []), ...(item.countries ?? []), ...item.tags, ...item.actors].filter(Boolean).join(' ').toLowerCase()
    return (!query || text.includes(query)) && (!filters.type || mediaType(item) === filters.type)
      && (!filters.genre || (item.genres ?? []).includes(filters.genre))
      && (!filters.country || (item.countries ?? []).includes(filters.country))
      && (!filters.year || String(mediaYear(item)) === filters.year)
  })
  const factor = filters.order === 'asc' ? 1 : -1
  return selected.sort((a, b) => {
    if (['year', 'rating', 'budget', 'revenue'].includes(filters.sort)) {
      const key = ({ year: 'year', rating: 'rating', budget: 'budgetUsd', revenue: 'revenueUsd' } as const)[filters.sort as 'year' | 'rating' | 'budget' | 'revenue']
      const first = key === 'year' ? mediaYear(a) : a[key], second = key === 'year' ? mediaYear(b) : b[key]
      if (first === undefined || second === undefined) return first !== undefined ? -1 : second !== undefined ? 1 : 0
      return factor * (first - second)
    }
    if (filters.sort === 'title') return factor * a.title.localeCompare(b.title)
    return factor * (Date.parse(a.addedAt) - Date.parse(b.addedAt))
  })
}
