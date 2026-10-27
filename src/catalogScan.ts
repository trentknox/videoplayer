import type { AnalysisResult } from './types'

type Listing = NonNullable<AnalysisResult['listings']>[number]
type Analyze = (url: string) => Promise<AnalysisResult>

/** Bounded scan: keep the current page as the cursor if a batch stops mid-page. */
export async function scanCatalog(start: string, knownUrls: Iterable<string>, analyze: Analyze): Promise<{ listings: Listing[]; cursor?: string; sections: Array<{ url: string; title: string }> }> {
  const origin = new URL(start).origin
  const sameOrigin = (value: string | undefined): value is string => {
    if (!value) return false
    try { return new URL(value).origin === origin } catch { return false }
  }
  const known = new Set(knownUrls)
  const visited = new Set<string>()
  const listings: Listing[] = []
  const sections = new Map<string, { url: string; title: string }>()
  let current: string | undefined = start
  let cursor: string | undefined
  for (let pageCount = 0; current && pageCount < 5; pageCount += 1) {
    if (visited.has(current)) break
    visited.add(current)
    const page: AnalysisResult = await analyze(current)
    if (page.analysisUnavailable) throw new Error('Could not read the catalog page. Your scan position is unchanged; try again.')
    for (const section of page.catalogSections ?? []) if (sameOrigin(section.url)) sections.set(section.url, section)
    if (!page.listings?.length && sameOrigin(page.suggestedCatalogUrl) && !visited.has(page.suggestedCatalogUrl)) {
      current = page.suggestedCatalogUrl
      cursor = current
      continue
    }
    const items = page.listings ?? []
    const next: string | undefined = sameOrigin(page.nextCatalogUrl) && !visited.has(page.nextCatalogUrl) ? page.nextCatalogUrl : undefined
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      if (known.has(item.url)) continue
      known.add(item.url)
      listings.push(item)
      if (listings.length === 25) {
        cursor = index < items.length - 1 ? current : next
        return { listings, cursor, sections: [...sections.values()] }
      }
    }
    current = next
    cursor = next
  }
  return { listings, cursor, sections: [...sections.values()] }
}
