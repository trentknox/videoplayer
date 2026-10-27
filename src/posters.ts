export function posterSources(value: string, provider?: string, externalId?: string): string[] {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return []
    const candidates: string[] = []
    if (url.hostname === 'image.tmdb.org' && !url.search && !url.hash) {
      const upgraded = new URL(url.href)
      upgraded.pathname = upgraded.pathname.replace(/^\/t\/p\/(?:w92|w154|w185|w342|w500)\//, '/t/p/w780/')
      candidates.push(upgraded.href)
    }
    if (provider === 'youtube' && externalId && /^[A-Za-z0-9_-]+$/.test(externalId) && url.hostname === 'i.ytimg.com') candidates.push(`https://i.ytimg.com/vi/${externalId}/maxresdefault.jpg`)
    candidates.push(url.href)
    return [...new Set(candidates)]
  } catch { return [] }
}
