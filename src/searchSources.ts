import { scanCatalog } from './catalogScan.ts'
import { advanceCatalogJob } from './catalogJob.ts'
import type { AnalysisResult, CatalogJob, SavedSource } from './types'

type Analyze = (url: string) => Promise<AnalysisResult>
type Listing = NonNullable<AnalysisResult['listings']>[number]

/** Resume a bounded portion of each public source; callers persist the returned cursors. */
export async function discoverForSearch(sources: SavedSource[], knownUrls: string[], jobs: Record<string, CatalogJob>, analyze: Analyze): Promise<{ listings: Listing[]; jobs: Record<string, CatalogJob>; incomplete: boolean; failed: number }> {
  const known = new Set(knownUrls)
  const output: Listing[] = []
  const nextJobs = { ...jobs }
  let incomplete = sources.length > 3
  let failed = 0
  for (const source of sources.slice(0, 3)) {
    let job = nextJobs[source.url] ?? { current: source.url, pending: [], seen: [source.url] }
    try {
      // Sources such as YouTube channels require a provider API; do not claim they were scanned.
      const probe = await analyze(job.current ?? source.url)
      if (probe.analysisUnavailable || (probe.provider !== 'embed' && !probe.listings?.length)) { failed++; incomplete = true; continue }
      for (let batch = 0; job.current && batch < 4; batch++) {
        const current = job.current
        const found = await scanCatalog(current, known, analyze)
        for (const listing of found.listings) { known.add(listing.url); output.push(listing) }
        job = advanceCatalogJob(source.url, job, found.cursor, found.sections)
        nextJobs[source.url] = job
      }
      if (job.current) incomplete = true
      else delete nextJobs[source.url]
    } catch { failed++; incomplete = true }
  }
  return { listings: output, jobs: nextJobs, incomplete, failed }
}
