import { useEffect, useRef } from 'react'
import type { MediaItem } from './types'

interface PlayerSurfaceProps {
  item?: MediaItem
}

export default function PlayerSurface({ item }: PlayerSurfaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const isHls = Boolean(item?.embedUrl.match(/\.m3u8(?:$|[?#])/i))

  useEffect(() => {
    const video = videoRef.current
    if (!item || !video || !isHls) return
    let cancelled = false
    let destroy: (() => void) | undefined
    void import('hls.js').then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) return
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

  if (item.provider === 'direct' || isHls) {
    return (
      <video
        ref={videoRef}
        className="media-video"
        controls
        autoPlay
        playsInline
        src={item.embedUrl}
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
