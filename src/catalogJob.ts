import type { CatalogJob } from './types'

export function advanceCatalogJob(root: string, job: CatalogJob, cursor: string | undefined, sections: Array<{ url: string; series?: string }>): CatalogJob {
  const origin = new URL(root).origin
  const pending = [...job.pending]
  const seen = new Set(job.seen)
  const seriesNames = { ...job.seriesNames }
  for (const section of sections) {
    try {
      const url = new URL(section.url)
      url.hash = ''
      if (url.origin !== origin || seen.has(url.href)) continue
      seen.add(url.href)
      pending.push(url.href)
      if (section.series) seriesNames[url.href] = section.series
    } catch { /* Ignore malformed section links. */ }
  }
  const current = cursor ?? pending.shift()
  return { current, pending, seen: [...seen], seriesNames }
}
