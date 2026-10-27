import type { MediaItem } from './types'

export interface LibraryFilters { query: string; type: string; genre: string; country: string; year: string; sort: 'added' | 'title' | 'year' | 'rating' | 'budget' | 'revenue'; order: 'asc' | 'desc' }
export const defaultFilters: LibraryFilters = { query: '', type: '', genre: '', country: '', year: '', sort: 'added', order: 'desc' }

export function filterLibrary(items: MediaItem[], filters: LibraryFilters): MediaItem[] {
  const query = filters.query.trim().toLowerCase()
  const selected = items.filter((item) => {
    const text = [item.title, item.description, item.provider, item.franchise, item.series, item.season, item.episode, item.year, ...(item.genres ?? []), ...(item.countries ?? []), ...item.tags, ...item.actors].filter(Boolean).join(' ').toLowerCase()
    return (!query || text.includes(query)) && (!filters.type || item.contentType === filters.type)
      && (!filters.genre || (item.genres ?? []).includes(filters.genre))
      && (!filters.country || (item.countries ?? []).includes(filters.country))
      && (!filters.year || String(item.year) === filters.year)
  })
  const factor = filters.order === 'asc' ? 1 : -1
  return selected.sort((a, b) => {
    if (['year', 'rating', 'budget', 'revenue'].includes(filters.sort)) {
      const key = ({ year: 'year', rating: 'rating', budget: 'budgetUsd', revenue: 'revenueUsd' } as const)[filters.sort as 'year' | 'rating' | 'budget' | 'revenue']
      const first = a[key], second = b[key]
      if (first === undefined || second === undefined) return first !== undefined ? -1 : second !== undefined ? 1 : 0
      return factor * (first - second)
    }
    if (filters.sort === 'title') return factor * a.title.localeCompare(b.title)
    return factor * (Date.parse(a.addedAt) - Date.parse(b.addedAt))
  })
}
