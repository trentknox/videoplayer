type AnalyzeContext = { request: Request }

const MAX_HTML_BYTES = 350_000
const directMedia = /\.(mp4|webm|m4v|mov|m3u8|mpd)(?:$|[?#])/i

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'Content-Type',
    },
  })
}

export const onRequestOptions = (): Response => new Response(null, {
  status: 204,
  headers: {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'access-control-max-age': '600',
  },
})

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host.includes(':') && (host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('::ffff:') || /^fe[89ab][0-9a-f:]*$/i.test(host))) return true
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ipv4) return false
  const octets = ipv4.slice(1).map(Number)
  if (octets.some((part) => part > 255)) return true
  return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || octets[0] >= 224
    || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
}

function toPublicUrl(value: string | undefined, base: URL): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value.trim(), base)
    if (!['http:', 'https:'].includes(url.protocol) || isPrivateHost(url.hostname)) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
}

function metadata(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeEntities(match[1].trim())
  }
  return undefined
}

function titleFromDocument(html: string): string | undefined {
  const metaTitle = metadata(html, 'og:title') ?? metadata(html, 'twitter:title')
  if (metaTitle) return metaTitle
  const title = html.match(/<title[^>]*>\s*([\s\S]*?)\s*<\/title>/i)?.[1]
  return title?.replace(/\s+/g, ' ').trim()
}

function attributeSource(html: string, element: string): string | undefined {
  const tag = html.match(new RegExp(`<${element}\\b[^>]*\\bsrc=["']([^"']+)["'][^>]*>`, 'i'))
  return tag?.[1]
}

function textField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function findVideoObject(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (depth > 6 || !value) return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoObject(item, depth + 1)
      if (found) return found
    }
    return undefined
  }
  if (typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const type = record['@type']
  const types = Array.isArray(type) ? type : [type]
  if (types.some((entry) => entry === 'VideoObject')) return record
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'video', 'associatedMedia']) {
    const found = findVideoObject(record[key], depth + 1)
    if (found) return found
  }
  return undefined
}

interface StructuredVideo {
  url?: string
  iframe?: string
  title?: string
  poster?: string
  description?: string
}

function structuredVideo(html: string, base: URL): StructuredVideo {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)
  for (const script of scripts) {
    try {
      const video = findVideoObject(JSON.parse(script[1]))
      if (!video) continue
      const thumbnail = Array.isArray(video.thumbnailUrl) ? video.thumbnailUrl[0] : video.thumbnailUrl
      return {
        url: toPublicUrl(textField(video.contentUrl), base),
        iframe: toPublicUrl(textField(video.embedUrl), base),
        title: textField(video.name),
        poster: toPublicUrl(textField(thumbnail), base),
        description: textField(video.description),
      }
    } catch {
      // Invalid JSON-LD is common on public pages; continue to the next source.
    }
  }
  return {}
}

function catalogMetadata(html: string): { contentType?: 'movie' | 'series' | 'episode'; contentRating?: string; genres?: string[]; countries?: string[]; year?: number; actors?: string[]; rating?: number; budgetUsd?: number; revenueUsd?: number } {
  const find = (value: unknown, depth = 0): Record<string, unknown> | undefined => {
    if (!value || depth > 6) return undefined
    if (Array.isArray(value)) { for (const entry of value) { const found = find(entry, depth + 1); if (found) return found } return undefined }
    if (typeof value !== 'object') return undefined
    const record = value as Record<string, unknown>
    const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']]
    if (types.some((type) => ['Movie', 'TVSeries', 'TVEpisode'].includes(String(type)))) return record
    for (const key of ['@graph', 'mainEntity', 'itemListElement']) { const found = find(record[key], depth + 1); if (found) return found }
    return undefined
  }
  const names = (value: unknown): string[] => (Array.isArray(value) ? value : value ? [value] : []).map((entry) => typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? textField((entry as Record<string, unknown>).name) : undefined).filter((entry): entry is string => Boolean(entry)).map((entry) => entry.trim().slice(0, 120)).filter(Boolean).slice(0, 30)
  for (const script of html.matchAll(/<script[^>]+type=["']application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const record = find(JSON.parse(script[1]))
      if (!record) continue
      const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']]
      const date = textField(record.datePublished)
      const match = date?.match(/^(\d{4})/)
      const ratingRecord = record.aggregateRating && typeof record.aggregateRating === 'object' ? record.aggregateRating as Record<string, unknown> : undefined
      const rating = Number(ratingRecord?.ratingValue)
      const maximum = Number(ratingRecord?.bestRating ?? 10)
      const usd = (value: unknown): number | undefined => {
        if (!value || typeof value !== 'object') return undefined
        const amount = value as Record<string, unknown>
        const currency = String(amount.currency ?? amount.priceCurrency ?? '').toUpperCase()
        const number = Number(amount.value ?? amount.price)
        return currency === 'USD' && Number.isFinite(number) && number >= 0 ? number : undefined
      }
      return {
        contentType: types.includes('Movie') ? 'movie' : types.includes('TVSeries') ? 'series' : 'episode',
        contentRating: textField(record.contentRating)?.slice(0, 40),
        genres: names(record.genre), countries: names(record.countryOfOrigin), actors: names(record.actor ?? record.actors),
        year: match ? Number(match[1]) : undefined,
        rating: Number.isFinite(rating) && Number.isFinite(maximum) && maximum > 0 && rating >= 0 && rating <= maximum ? rating / maximum * 10 : undefined,
        budgetUsd: usd(record.budget), revenueUsd: usd(record.boxOffice ?? record.revenue),
      }
    } catch { /* Ignore malformed structured data. */ }
  }
  return {}
}

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < MAX_HTML_BYTES) {
      const next = await reader.read()
      if (next.done) break
      const room = MAX_HTML_BYTES - total
      const value = next.value.byteLength > room ? next.value.slice(0, room) : next.value
      chunks.push(value)
      total += value.byteLength
      if (value.byteLength < next.value.byteLength) break
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function publicCandidate(html: string, base: URL): StructuredVideo {
  const structured = structuredVideo(html, base)
  const source = metadata(html, 'og:video:secure_url')
    ?? metadata(html, 'og:video:url')
    ?? metadata(html, 'og:video')
    ?? metadata(html, 'twitter:player:stream')
    ?? attributeSource(html, 'source')
    ?? attributeSource(html, 'video')
  const iframe = metadata(html, 'twitter:player') ?? attributeSource(html, 'iframe')
  return {
    ...structured,
    url: toPublicUrl(source, base) ?? structured.url,
    iframe: toPublicUrl(iframe, base) ?? structured.iframe,
  }
}

// This site's normal public play action uses a page-provided identifier to request player URLs.
async function discoverSitePlayers(html: string, base: URL): Promise<Array<{ name: string; url: string }>> {
  if (base.hostname.toLowerCase() !== '1movies.stream') return []
  const seriesTag = html.match(/<[^>]*\bid=["']series-player["'][^>]*>/i)?.[0]
  const movieTag = html.match(/<[^>]*\bid=["']main-wrapper["'][^>]*>/i)?.[0]
  const tag = seriesTag ?? movieTag
  const token = tag?.match(/\bdata-token=["']([^"']{1,4096})["']/i)?.[1]
  if (!token) return []
  try {
    const body = new URLSearchParams({ [seriesTag ? 'players_show' : 'players']: decodeEntities(token) })
    const response = await fetch(new URL('/ajax/ajax.php', base), { method: 'POST', body, redirect: 'manual', signal: AbortSignal.timeout(8000) })
    if (!response.ok) return []
    const raw = (await readLimited(response)).slice(0, 65536)
    const parsed: unknown = JSON.parse(raw)
    const players = Array.isArray(parsed) ? parsed : [parsed]
    const results: Array<{ name: string; url: string }> = []
    const seen = new Set<string>()
    for (const player of players) {
      if (!player || typeof player !== 'object') continue
      const record = player as Record<string, unknown>
      const link = textField(record.link)
      const url = toPublicUrl(link, base)
      if (!url || seen.has(url)) continue
      seen.add(url)
      results.push({ name: (textField(record.name) ?? `Player ${results.length + 1}`).slice(0, 80), url })
      if (results.length >= 10) break
    }
    return results
  } catch { /* Fall back to a saved page when the public player request fails. */ }
  return []
}

function discoverListings(html: string, base: URL): Array<{ url: string; title: string; poster?: string; year?: number; season?: number; episode?: number }> {
  const items: Array<{ url: string; title: string; poster?: string; year?: number; season?: number; episode?: number }> = []
  const seen = new Set<string>()
  const attribute = (tag: string, name: string) => tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1]
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const tag = match[1]
    const content = match[2]
    const href = toPublicUrl(decodeEntities(attribute(tag, 'href') ?? ''), base)
    if (!href) continue
    const url = new URL(href)
    url.hash = ''
    if (url.origin !== base.origin || url.pathname === '/' || url.pathname === base.pathname || seen.has(url.href)) continue
    let image = content.match(/<img\b([^>]*)>/i)?.[1] ?? ''
    if (!image && match.index !== undefined) {
      // Many catalog cards place the image immediately before their overlay link.
      const preceding = html.slice(Math.max(0, match.index - 3000), match.index)
      const card = preceding.match(/<div\b[^>]*class=["'][^"']*\bfilm-poster\b[^"']*["'][^>]*>[\s\S]*$/i)?.[0]
      if (card) {
        const imageMatch = [...card.matchAll(/<img\b([^>]*)>/gi)].at(-1)
        const afterImage = imageMatch?.index === undefined ? '' : card.slice(imageMatch.index + imageMatch[0].length)
        if (imageMatch && !/<a\b/i.test(afterImage)) image = imageMatch[1]
      }
    }
    const episodeMatch = url.pathname.match(/(?:^|\/|[-_.])s(\d{1,3})[-_.]e(\d{1,3})(?:\/|$|[-_.])/i)
    if (!image && !episodeMatch && !/^\/watch(?:[-_][^/]+)?\/[^/]+/i.test(url.pathname)) continue
    const title = attribute(tag, 'title') ?? attribute(tag, 'aria-label') ?? attribute(image, 'alt')
    if (!title || title.trim().length < 2) continue
    const srcset = [attribute(image, 'data-srcset'), attribute(image, 'srcset')].filter(Boolean).flatMap((value) => value!.split(',')).map((candidate) => {
      const parts = candidate.trim().split(/\s+/)
      const descriptor = parts[1] ?? ''
      const amount = Number.parseFloat(descriptor)
      const rank = Number.isFinite(amount) ? (descriptor.endsWith('x') ? amount * 1000 : amount) : 0
      return { url: toPublicUrl(decodeEntities(parts[0]), base), rank }
    }).filter((candidate): candidate is { url: string; rank: number } => Boolean(candidate.url)).sort((a, b) => b.rank - a.rank)
    const poster = srcset[0]?.url ?? ['data-original', 'data-lazy-src', 'data-src', 'src'].map((name) => toPublicUrl(decodeEntities(attribute(image, name) ?? ''), base)).find(Boolean)
    seen.add(url.href)
    const yearMatch = `${title} ${url.pathname}`.match(/(?:^|[\s_\-/([{])((?:19|20)\d{2})(?=$|[\s_\-/)\]}])/)
    const possibleYear = yearMatch ? Number(yearMatch[1]) : 0
    const year = possibleYear >= 1900 && possibleYear <= new Date().getFullYear() + 1 ? possibleYear : undefined
    items.push({ url: url.href, title: decodeEntities(title.trim()).slice(0, 200), poster, year, season: episodeMatch ? Number(episodeMatch[1]) : undefined, episode: episodeMatch ? Number(episodeMatch[2]) : undefined })
  }
  return items
}

function discoverSearchForm(html: string, base: URL): { url: string; parameter: string } | undefined {
  const attribute = (tag: string, name: string) => tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1]
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)) {
    const method = (attribute(match[1], 'method') ?? 'get').toLowerCase()
    if (method !== 'get') continue
    const action = toPublicUrl(decodeEntities(attribute(match[1], 'action') ?? base.href), base)
    if (!action) continue
    const url = new URL(action)
    if (url.origin !== base.origin || url.username || url.password) continue
    for (const input of match[2].matchAll(/<input\b([^>]*)>/gi)) {
      const name = attribute(input[1], 'name')
      const type = (attribute(input[1], 'type') ?? 'text').toLowerCase()
      if (name && /^(?:q|query|keyword|search|search_query)$/i.test(name) && ['text', 'search'].includes(type)) return { url: url.href, parameter: name }
    }
  }
  return undefined
}

function discoverCatalogPage(html: string, base: URL): string | undefined {
  const anchors = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)
  for (const match of anchors) {
    const label = match[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!/^(?:go to |visit |browse )?(?:the )?(?:home ?page|catalog(?:ue)?)$/i.test(label)) continue
    const href = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
    const url = toPublicUrl(href && decodeEntities(href), base)
    if (url && new URL(url).origin === base.origin && url !== base.href) return url
  }
  return undefined
}

function discoverCatalogSections(html: string, base: URL): Array<{ url: string; title: string }> {
  const sections: Array<{ url: string; title: string }> = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const title = match[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!/^(?:movies|films|tv shows|television|series)$/i.test(title)) continue
    const href = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
    const url = toPublicUrl(href && decodeEntities(href), base)
    if (!url || new URL(url).origin !== base.origin || url === base.href || seen.has(url)) continue
    seen.add(url)
    sections.push({ url, title })
  }
  return sections
}

function discoverNextPage(html: string, base: URL): string | undefined {
  for (const match of html.matchAll(/<(?:a|link)\b([^>]*)>/gi)) {
    const tag = match[1]
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!rel?.split(/\s+/).some((word) => word.toLowerCase() === 'next')) continue
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
    const resolved = toPublicUrl(href && decodeEntities(href), base)
    if (!resolved) continue
    const url = new URL(resolved)
    url.hash = ''
    if (url.origin === base.origin && url.href !== base.href) return url.href
  }
  return undefined
}

async function fetchPublicPage(initial: URL): Promise<{ response: Response; finalUrl: URL }> {
  let current = initial
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetch(current.toString(), {
      redirect: 'manual',
      headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' },
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: current }
    const next = toPublicUrl(response.headers.get('location') ?? undefined, current)
    if (!next) throw new Error('The page redirected to a blocked or unsupported address.')
    current = new URL(next)
  }
  throw new Error('The page redirected too many times.')
}

export const onRequestPost = async ({ request }: AnalyzeContext): Promise<Response> => {
  let rawUrl: unknown
  try {
    rawUrl = (await request.json() as { url?: unknown }).url
  } catch {
    return respond({ error: 'Expected a JSON object with a URL.' }, 400)
  }

  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) return respond({ error: 'A valid public URL is required.' }, 400)
  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return respond({ error: 'The URL could not be parsed.' }, 400)
  }
  if (!['http:', 'https:'].includes(target.protocol) || isPrivateHost(target.hostname)) {
    return respond({ error: 'Only public http(s) pages can be analyzed.' }, 400)
  }

  let fetched: { response: Response; finalUrl: URL }
  try {
    fetched = await fetchPublicPage(target)
  } catch (error) {
    if (error instanceof Error && error.message.includes('redirected')) return respond({ error: error.message }, 400)
    return respond({ error: 'The page could not be reached from the importer.' }, 422)
  }
  const { response, finalUrl } = fetched
  if (!response.ok) return respond({ error: `The page returned HTTP ${response.status}.` }, 422)
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    return respond({ error: 'That URL is not an HTML page. Import a direct media URL instead.' }, 422)
  }

  const html = await readLimited(response)
  const candidate = publicCandidate(html, finalUrl)
  const playerOptions = candidate.url || candidate.iframe ? [] : await discoverSitePlayers(html, finalUrl)
  const embedUrl = candidate.url ?? candidate.iframe ?? playerOptions[0]?.url
  const title = candidate.title ?? titleFromDocument(html) ?? finalUrl.hostname
  const poster = candidate.poster ?? toPublicUrl(metadata(html, 'og:image') ?? metadata(html, 'twitter:image'), finalUrl)
  const description = candidate.description ?? metadata(html, 'og:description') ?? metadata(html, 'description')

  return respond({
    provider: candidate.url && directMedia.test(candidate.url) ? 'direct' : 'embed',
    kind: embedUrl ? 'video' : 'catalog',
    sourceUrl: target.toString(),
    embedUrl: embedUrl ?? finalUrl.toString(),
    playerOptions,
    title,
    poster,
    description,
    ...catalogMetadata(html),
    durationSeconds: 900,
    listings: discoverListings(html, finalUrl),
    catalogSections: discoverCatalogSections(html, finalUrl),
    searchForm: discoverSearchForm(html, finalUrl),
    suggestedCatalogUrl: discoverCatalogPage(html, finalUrl),
    nextCatalogUrl: discoverNextPage(html, finalUrl),
    notes: [embedUrl
      ? 'Vivid found a standard public metadata or embedded-media reference. It saves the original source; it does not proxy or copy it.'
      : 'No standard public media reference was exposed, so Vivid saved the page as a source record.'],
  })
}
