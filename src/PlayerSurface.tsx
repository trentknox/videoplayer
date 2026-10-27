import { useEffect, useRef } from 'react'
import type { MediaItem } from './types'

type YoutubePlayer = { destroy: () => void }
type YoutubeApi = { Player: new (element: HTMLElement, options: { events: { onStateChange: (event: { data: number }) => void } }) => YoutubePlayer }
declare global { interface Window { YT?: YoutubeApi; onYouTubeIframeAPIReady?: () => void } }
let youtubeApiPromise: Promise<YoutubeApi> | undefined

function loadYoutubeApi(): Promise<YoutubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise<YoutubeApi>((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        previous?.()
        if (window.YT?.Player) resolve(window.YT)
        else reject(new Error('YouTube player API unavailable'))
      }
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.onerror = () => reject(new Error('Unable to load YouTube player API'))
      document.head.appendChild(script)
    }).catch((error) => { youtubeApiPromise = undefined; throw error })
  }
  return youtubeApiPromise
}

function YoutubeSurface({ item, onEnded, autoPlay }: { item: MediaItem; onEnded?: () => void; autoPlay?: boolean }) {
  const container = useRef<HTMLDivElement>(null)
  const endedRef = useRef(onEnded)
  endedRef.current = onEnded
  useEffect(() => {
    const parent = container.current
    if (!parent) return
    let cancelled = false
    let player: YoutubePlayer | undefined
    const frame = document.createElement('iframe')
    const url = new URL(item.embedUrl)
    url.searchParams.set('enablejsapi', '1')
    if (autoPlay) url.searchParams.set('autoplay', '1')
    if (window.location.origin !== 'null') url.searchParams.set('origin', window.location.origin)
    frame.src = url.href
    frame.className = 'media-embed'
    frame.title = item.title
    frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen'
    frame.allowFullscreen = true
    parent.appendChild(frame)
    void loadYoutubeApi().then((api) => {
      if (cancelled) return
      player = new api.Player(frame, { events: { onStateChange: (event) => { if (event.data === 0) endedRef.current?.() } } })
    }).catch(() => { /* The iframe remains playable even if the API fails. */ })
    return () => { cancelled = true; player?.destroy(); frame.remove() }
  }, [item.id, item.embedUrl, item.title, autoPlay])
  return <div ref={container} />
}

interface PlayerSurfaceProps {
  item?: MediaItem
  onEnded?: () => void
  autoPlay?: boolean
}

export default function PlayerSurface({ item, onEnded, autoPlay }: PlayerSurfaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const isHls = Boolean(item?.embedUrl.match(/\.m3u8(?:$|[?#])/i))

  useEffect(() => {
    const video = videoRef.current
    if (!item || !video || !isHls) return
    let cancelled = false
    let destroy: (() => void) | undefined
    void import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return
      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = item.embedUrl
        return
      }
      const hls = new Hls({ enableWorker: true })
      hls.loadSource(item.embedUrl)
      hls.attachMedia(video)
      destroy = () => hls.destroy()
    })
    return () => {
      cancelled = true
      destroy?.()
    }
  }, [item, isHls])

  if (!item) {
    return (
      <div className="player-empty">
        <span className="pulse-orb" />
        <p>Select something from your library to start watching.</p>
      </div>
    )
  }

  if (item.kind === 'catalog' && item.embedUrl === item.sourceUrl) {
    let source: string | undefined
    try {
      const url = new URL(item.sourceUrl)
      if (url.protocol === 'http:' || url.protocol === 'https:') source = url.href
    } catch { /* Invalid saved links cannot be opened. */ }
    return <div className="player-empty">
      <p>This is a saved website, not an imported video catalog. Vivid has not found individual titles or a playable embed.</p>
      {source && <a className="text-button" href={source} target="_blank" rel="noopener noreferrer">Open original website ↗</a>}
    </div>
  }

  if (item.provider === 'youtube') return <YoutubeSurface item={item} onEnded={onEnded} autoPlay={autoPlay} />

  if (item.provider === 'direct' || isHls) {
    return (
      <video
        ref={videoRef}
        className="media-video"
        controls
        autoPlay
        playsInline
        onEnded={onEnded}
        src={isHls ? undefined : item.embedUrl}
      >
        Your browser cannot play this source.
      </video>
    )
  }

  return (
    <iframe
      className="media-embed"
      src={item.embedUrl}
      title={item.title}
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  )
}
