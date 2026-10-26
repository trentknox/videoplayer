import type { AnalysisResult, Provider } from './types'

const mediaExtension = /\.(mp4|webm|m4v|mov|m3u8|mpd)(?:$|[?#])/i

function textFromSlug(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function titleFromUrl(url: URL): string {
  const lastSegment = url.pathname.split('/').filter(Boolean).at(-1)
  return lastSegment ? textFromSlug(lastSegment.replace(/\.[^.]+$/, '')) : url.hostname
}

function youtubeAnalysis(url: URL): AnalysisResult | null {
  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') return null

  const playlist = url.searchParams.get('list')
  let videoId = url.searchParams.get('v')
  if (host === 'youtu.be') videoId = url.pathname.slice(1)
  if (!videoId && url.pathname.startsWith('/embed/')) videoId = url.pathname.split('/')[2]

  if (playlist && !videoId) {
    return {
      provider: 'youtube', kind: 'playlist', sourceUrl: url.toString(), externalId: playlist,
      embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(playlist)}&rel=0`,
      title: 'YouTube playlist', durationSeconds: 1800,
      notes: ['Saved as a playlist source. Full enumeration needs a permitted YouTube Data API connection.'],
    }
  }
  if (videoId) {
    return {
      provider: 'youtube', kind: 'video', sourceUrl: url.toString(), externalId: videoId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`,
      title: 'YouTube video', poster: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`, durationSeconds: 900,
    }
  }
  if (url.pathname.includes('/channel/') || url.pathname.startsWith('/@')) {
    return {
      provider: 'youtube', kind: 'channel', sourceUrl: url.toString(), embedUrl: url.toString(),
      title: 'YouTube channel', durationSeconds: 1800,
      notes: ['Saved as a channel source. Connect the YouTube Data API to enumerate uploads.'],
    }
  }
  return null
}

function twitchAnalysis(url: URL): AnalysisResult | null {
  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'twitch.tv' && host !== 'player.twitch.tv') return null
  const segments = url.pathname.split('/').filter(Boolean)
  const parent = window.location.hostname || 'localhost'
  if (segments[0] === 'videos' && segments[1]) {
    return {
      provider: 'twitch', kind: 'video', sourceUrl: url.toString(), externalId: segments[1],
      embedUrl: `https://player.twitch.tv/?video=${encodeURIComponent(segments[1])}&parent=${encodeURIComponent(parent)}`,
      title: 'Twitch video', durationSeconds: 3600,
    }
  }
  const channel = url.searchParams.get('channel') ?? segments[0]
  if (channel) {
    return {
      provider: 'twitch', kind: 'channel', sourceUrl: url.toString(), externalId: channel,
      embedUrl: `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parent)}`,
      title: `Twitch · ${channel}`, durationSeconds: 3600,
    }
  }
  return null
}

function cloudflareStreamAnalysis(url: URL): AnalysisResult | null {
  const host = url.hostname.toLowerCase()
  if (!host.includes('cloudflarestream.com') && host !== 'videodelivery.net' && host !== 'iframe.videodelivery.net') return null
  const uid = url.pathname.split('/').filter(Boolean)[0]
  if (!uid) return null
  const isManifest = /\/manifest\/[^/]+\.m3u8(?:$|[?#])/i.test(url.pathname)
  const iframeUrl = host === 'iframe.videodelivery.net'
    ? `https://iframe.videodelivery.net/${encodeURIComponent(uid)}`
    : host.includes('cloudflarestream.com')
      ? `${url.protocol}//${url.host}/${encodeURIComponent(uid)}/iframe`
      : undefined
  if (!iframeUrl && !isManifest) return null
  return {
    provider: 'cloudflare-stream', kind: isManifest || url.pathname.includes('live') ? 'stream' : 'video', sourceUrl: url.toString(), externalId: uid,
    embedUrl: isManifest ? url.toString() : iframeUrl!, title: 'Cloudflare Stream video', durationSeconds: 900,
    notes: [isManifest
      ? 'Cloudflare Stream HLS is read directly from the provider; Vivid does not proxy or cache it.'
      : 'Cloudflare Stream media is played from its provider-hosted player.'],
  }
}

function plexAnalysis(url: URL): AnalysisResult | null {
  const host = url.hostname.toLowerCase()
  if (!host.includes('plex') && !url.pathname.includes('web/index.html')) return null
  return {
    provider: 'plex', kind: 'catalog', sourceUrl: url.toString(), embedUrl: url.toString(),
    title: 'Plex source', durationSeconds: 1800,
    notes: ['Plex connections stay in this browser. Do not add account tokens to a public deployment.'],
  }
}

export function analyzeUrl(rawUrl: string): AnalysisResult {
  const url = new URL(rawUrl.trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use a public http(s) URL.')
  const known = youtubeAnalysis(url) ?? twitchAnalysis(url) ?? cloudflareStreamAnalysis(url) ?? plexAnalysis(url)
  if (known) return known
  if (mediaExtension.test(url.pathname)) {
    return {
      provider: 'direct', kind: url.pathname.endsWith('.m3u8') ? 'stream' : 'video', sourceUrl: url.toString(), embedUrl: url.toString(),
      title: titleFromUrl(url), durationSeconds: 900,
      notes: ['Direct playback depends on the source server allowing browser CORS and range requests.'],
    }
  }
  return {
    provider: 'embed', kind: 'catalog', sourceUrl: url.toString(), embedUrl: url.toString(), title: titleFromUrl(url), durationSeconds: 1800,
    notes: ['Saved as an embeddable source. Use Analyze public page to discover standard video or iframe metadata where the site permits it.'],
  }
}

export async function analyzePublicPage(rawUrl: string): Promise<AnalysisResult> {
  const fallback = analyzeUrl(rawUrl)
  if (fallback.provider !== 'embed') return fallback
  const response = await fetch('/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: rawUrl }),
  })
  if (!response.ok) return fallback
  const result = await response.json() as Partial<AnalysisResult>
  if (!result.embedUrl || !result.provider || !result.kind || !result.sourceUrl || !result.title) return fallback
  return {
    provider: result.provider as Provider, kind: result.kind, sourceUrl: result.sourceUrl, embedUrl: result.embedUrl,
    externalId: result.externalId, title: result.title, poster: result.poster, description: result.description,
    durationSeconds: result.durationSeconds ?? 900, notes: result.notes,
  }
}

export async function enrichYouTubeItem(result: AnalysisResult): Promise<AnalysisResult> {
  if (result.provider !== 'youtube' || result.kind !== 'video') return result
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(result.sourceUrl)}&format=json`)
    if (!response.ok) return result
    const data = await response.json() as { title?: string; thumbnail_url?: string; author_name?: string }
    return {
      ...result,
      title: data.title || result.title,
      poster: data.thumbnail_url || result.poster,
      description: data.author_name ? `From ${data.author_name}` : result.description,
    }
  } catch {
    return result
  }
}
