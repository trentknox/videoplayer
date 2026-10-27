import type { AnalysisResult, SavedSource } from './types'
type Analyze = (url: string) => Promise<AnalysisResult>
type Listing = NonNullable<AnalysisResult['listings']>[number]

export function sourceSearchTerms(query: string): string {
  const stop = new Set(['the','and','for','all','by','of','movie','movies','series','channel','channels','playlist','create','generate','make','loop','with','from','show','shows','please','everything','watch','find','search','24'])
  return (query.match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length > 1 && !stop.has(word.toLowerCase())).join(' ').slice(0, 200)
}

/** Use a site's public GET search form, without modifying its URL or bypassing access controls. */
export async function searchPublicSources(sources: SavedSource[], query: string, analyze: Analyze): Promise<{ listings: Listing[]; searched: number; unavailable: number; incomplete: boolean }> {
  const terms = sourceSearchTerms(query)
  if (!terms) return { listings: [], searched: 0, unavailable: 0, incomplete: false }
  const listings: Listing[] = [], seen = new Set<string>()
  let searched = 0, unavailable = 0, incomplete = sources.length > 3
  for (const source of sources.slice(0, 3)) {
    try {
      const sourceUrl = new URL(source.url)
      const root = await analyze(source.url)
      if (root.analysisUnavailable || !root.searchForm) { unavailable++; continue }
      const url = new URL(root.searchForm.url, sourceUrl)
      if (url.origin !== sourceUrl.origin || url.username || url.password || !/^(?:q|query|keyword|search|search_query)$/i.test(root.searchForm.parameter)) { unavailable++; continue }
      url.searchParams.set(root.searchForm.parameter, terms)
      let current: string | undefined = url.href
      let pages = 0
      const visited = new Set<string>()
      while (current && pages < 3 && !visited.has(current)) {
        visited.add(current)
        const result = await analyze(current)
        if (result.analysisUnavailable) throw new Error('Source search unavailable')
        for (const item of result.listings ?? []) {
          try { const itemUrl = new URL(item.url); if (itemUrl.origin !== sourceUrl.origin || seen.has(itemUrl.href)) continue; seen.add(itemUrl.href); listings.push(item) } catch { /* Ignore malformed source entries. */ }
        }
        pages++
        try { const next: URL | undefined = result.nextCatalogUrl ? new URL(result.nextCatalogUrl, sourceUrl) : undefined; current = next && next.origin === sourceUrl.origin && !visited.has(next.href) ? next.href : undefined } catch { current = undefined }
      }
      // A site search for a person may return only a documentary. Follow an
      // exact cast link from a result to the site's public filmography page.
      if (listings.length > 0 && terms.trim().includes(' ')) {
        const snapshot = listings.filter((item) => { try { return new URL(item.url).origin === sourceUrl.origin } catch { return false } }).slice(0, 2)
        for (const listing of snapshot) {
          const detail = await analyze(listing.url)
          if (detail.analysisUnavailable) break
          const person = detail.people?.find((entry) => entry.name.trim().toLocaleLowerCase() === terms.trim().toLocaleLowerCase())
          if (!person) continue
          const personUrl = new URL(person.url, sourceUrl)
          if (personUrl.origin !== sourceUrl.origin || personUrl.username || personUrl.password) continue
          let filmographyUrl: string | undefined = personUrl.href
          const personPages = new Set<string>()
          while (filmographyUrl && personPages.size < 3 && !personPages.has(filmographyUrl)) {
            personPages.add(filmographyUrl)
            const filmography = await analyze(filmographyUrl)
            if (filmography.analysisUnavailable) { incomplete = true; break }
            for (const item of filmography.listings ?? []) {
              try { const itemUrl = new URL(item.url); if (itemUrl.origin !== sourceUrl.origin || seen.has(itemUrl.href)) continue; seen.add(itemUrl.href); listings.push({ ...item, actors: [person.name] }) } catch { /* Ignore invalid links. */ }
            }
            try { const next: URL | undefined = filmography.nextCatalogUrl ? new URL(filmography.nextCatalogUrl, sourceUrl) : undefined; filmographyUrl = next && next.origin === sourceUrl.origin && !personPages.has(next.href) ? next.href : undefined } catch { filmographyUrl = undefined }
          }
          if (filmographyUrl) incomplete = true
          break
        }
      }
      searched++
      if (current) incomplete = true
    } catch { unavailable++ }
  }
  return { listings, searched, unavailable, incomplete: incomplete || unavailable > 0 }
}
