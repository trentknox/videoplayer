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
    },
  })
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === '::1' || host === '[::1]' || host.startsWith('fc') || host.startsWith('fd')) return true
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ipv4) return false
  const octets = ipv4.slice(1).map(Number)
  if (octets.some((part) => part > 255)) return true
  return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || octets[0] >= 224
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

function publicCandidate(html: string, base: URL): { url?: string; iframe?: string } {
  const source = metadata(html, 'og:video:secure_url')
    ?? metadata(html, 'og:video:url')
    ?? metadata(html, 'og:video')
    ?? metadata(html, 'twitter:player:stream')
    ?? attributeSource(html, 'source')
    ?? attributeSource(html, 'video')
  const iframe = metadata(html, 'twitter:player') ?? attributeSource(html, 'iframe')
  return { url: toPublicUrl(source, base), iframe: toPublicUrl(iframe, base) }
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
  const embedUrl = candidate.url ?? candidate.iframe
  const title = titleFromDocument(html) ?? finalUrl.hostname
  const poster = toPublicUrl(metadata(html, 'og:image') ?? metadata(html, 'twitter:image'), finalUrl)
  const description = metadata(html, 'og:description') ?? metadata(html, 'description')

  return respond({
    provider: candidate.url && directMedia.test(candidate.url) ? 'direct' : 'embed',
    kind: candidate.url && directMedia.test(candidate.url) ? 'video' : 'catalog',
    sourceUrl: target.toString(),
    embedUrl: embedUrl ?? finalUrl.toString(),
    title,
    poster,
    description,
    durationSeconds: 900,
    notes: [embedUrl
      ? 'Vivid found a standard public metadata or embedded-media reference. It saves the original source; it does not proxy or copy it.'
      : 'No standard public media reference was exposed, so Vivid saved the page as a source record.'],
  })
}
