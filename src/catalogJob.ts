import type { CatalogJob } from './types'

export function advanceCatalogJob(root: string, job: CatalogJob, cursor: string | undefined, sections: Array<{ url: string }>): CatalogJob {
  const origin = new URL(root).origin
  const pending = [...job.pending]
  const seen = new Set(job.seen)
  for (const section of sections) {
    try {
      const url = new URL(section.url)
      url.hash = ''
      if (url.origin !== origin || seen.has(url.href) || seen.size >= 100) continue
      seen.add(url.href)
      pending.push(url.href)
    } catch { /* Ignore malformed section links. */ }
  }
  const current = cursor ?? pending.shift()
  return { current, pending, seen: [...seen] }
}
