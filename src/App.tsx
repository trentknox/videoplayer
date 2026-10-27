import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import PlayerSurface from './PlayerSurface'
import { exportLibrary, importLibrary, loadLibrary, saveLibrary } from './library'
import { analyzePublicPage, analyzeUrl, enrichYouTubeItem } from './providers'
import { scanCatalog } from './catalogScan'
import { formatClock, makeSchedule, nowPlaying } from './scheduler'
import type { AnalysisResult, Channel, ImportDraft, LibraryState, MediaItem, Playlist } from './types'

type View = 'home' | 'library' | 'playlists' | 'channels' | 'settings'

declare global {
  interface Window {
    vividWindow?: { minimize: () => void; toggleMaximize: () => void; close: () => void }
  }
}

const blankDraft: ImportDraft = {
  url: '', title: '', tags: '', franchise: '', series: '', season: '', episode: '', actors: '', durationMinutes: '',
}

const accents = ['#8a7dff', '#24d6b8', '#ff8a65', '#ffcc4d', '#4da3ff']

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function formatRuntime(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

function providerLabel(provider: MediaItem['provider']): string {
  return provider.replaceAll('-', ' ')
}

function safeExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch { return undefined }
}

function sourceGlyph(provider: MediaItem['provider']): string {
  return ({ youtube: '▶', twitch: '◉', plex: '◆', 'cloudflare-stream': '☁', direct: '↗', embed: '◌' })[provider]
}

function toMediaItem(analysis: AnalysisResult, draft: ImportDraft, pageAnalysis: boolean): MediaItem {
  return {
    id: makeId('media'),
    provider: analysis.provider,
    kind: analysis.kind,
    sourceUrl: analysis.sourceUrl,
    embedUrl: analysis.embedUrl,
    externalId: analysis.externalId,
    title: draft.title.trim() || analysis.title,
    description: analysis.description,
    poster: analysis.poster,
    durationSeconds: draft.durationMinutes ? Number(draft.durationMinutes) * 60 : analysis.durationSeconds ?? 900,
    tags: splitList(draft.tags),
    franchise: draft.franchise.trim() || undefined,
    series: draft.series.trim() || undefined,
    season: draft.season ? Number(draft.season) : undefined,
    episode: draft.episode ? Number(draft.episode) : undefined,
    actors: splitList(draft.actors),
    addedAt: new Date().toISOString(),
    importMode: pageAnalysis ? 'page-analysis' : analysis.kind === 'playlist' ? 'playlist' : analysis.kind === 'channel' ? 'channel' : analysis.kind === 'catalog' ? 'catalog' : 'single',
  }
}

export default function App() {
  const [library, setLibrary] = useState<LibraryState | null>(null)
  const [activeId, setActiveId] = useState<string>()
  const [activePlaylistId, setActivePlaylistId] = useState<string>()
  const [activeChannelId, setActiveChannelId] = useState<string>()
  const [channelSlotId, setChannelSlotId] = useState<string>()
  const [channelSlotStart, setChannelSlotStart] = useState<string>()
  const [view, setView] = useState<View>('home')
  const [draft, setDraft] = useState<ImportDraft>(blankDraft)
  const [pageAnalysis, setPageAnalysis] = useState(true)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [playlistName, setPlaylistName] = useState('')
  const [channelName, setChannelName] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [clock, setClock] = useState(() => new Date())
  const importInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadLibrary().then((loaded) => {
      setLibrary(loaded)
      setActiveId(loaded.media[0]?.id)
    })
  }, [])

  useEffect(() => {
    if (library) void saveLibrary(library)
  }, [library])

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const active = library?.media.find((item) => item.id === activeId)
  const activePlaylist = library?.playlists.find((playlist) => playlist.id === activePlaylistId)
  const visibleMedia = useMemo(() => {
    if (!library) return []
    const needle = search.trim().toLowerCase()
    if (!needle) return library.media
    return library.media.filter((item) => [item.title, item.provider, item.franchise, item.series, item.season, item.episode, ...item.tags, ...item.actors]
      .filter(Boolean).join(' ').toLowerCase().includes(needle))
  }, [library, search])

  const allSchedules = useMemo(() => {
    if (!library) return new Map<string, ReturnType<typeof makeSchedule>>()
    return new Map(library.channels.map((channel) => [channel.id, makeSchedule(channel, library.media, clock)]))
  }, [library, clock])

  useEffect(() => {
    if (!activeChannelId || !library) return
    const channel = library.channels.find((entry) => entry.id === activeChannelId)
    if (!channel) return
    let timer: number | undefined
    const update = () => {
      const now = new Date()
      const slot = nowPlaying(makeSchedule(channel, library.media, now), now)
      if (!slot) return
      setActiveId(slot.mediaId)
      setChannelSlotId(slot.id)
      setChannelSlotStart(slot.startsAt)
      timer = window.setTimeout(update, Math.max(100, new Date(slot.endsAt).getTime() - now.getTime() + 50))
    }
    update()
    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [activeChannelId, library])

  function updateLibrary(updater: (current: LibraryState) => LibraryState): void {
    setLibrary((current) => current ? updater(current) : current)
  }

  function updateDraft<K extends keyof ImportDraft>(key: K, value: ImportDraft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function nextInPlaylist(): void {
    if (!activePlaylist || !library) return
    const ids = activePlaylist.mediaIds.filter((id) => library.media.some((item) => item.id === id))
    const index = ids.indexOf(activeId ?? '')
    if (index >= 0 && index + 1 < ids.length) setActiveId(ids[index + 1])
    else { setActivePlaylistId(undefined); setNotice('Playlist finished.') }
  }

  async function handleImport(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!library || !draft.url.trim()) return
    setImporting(true)
    setNotice('')
    try {
      const initial = pageAnalysis ? await analyzePublicPage(draft.url) : analyzeUrl(draft.url)
      const analysis = await enrichYouTubeItem(initial)
      if (library.media.some((item) => item.sourceUrl === analysis.sourceUrl)) {
        const existing = library.media.find((item) => item.sourceUrl === analysis.sourceUrl)
        setActiveId(existing?.id)
        setNotice('That source is already in your library.')
        return
      }
      const item = toMediaItem(analysis, draft, pageAnalysis)
      updateLibrary((current) => ({ ...current, media: [item, ...current.media] }))
      setActivePlaylistId(undefined)
      setActiveChannelId(undefined)
      setActiveId(item.id)
      setDraft(blankDraft)
      setView('library')
      setNotice(analysis.notes?.[0] ?? 'Imported into your private local library.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Vivid could not analyze that source.')
    } finally {
      setImporting(false)
    }
  }

  async function importPageListings(): Promise<void> {
    if (!library || !draft.url.trim()) { setNotice('Enter a website URL first.'); return }
    setImporting(true)
    setNotice('Looking for titles on this page…')
    try {
      const source = new URL(draft.url).href
      const start = library.catalogCursors?.[source] ?? source
      const { listings, cursor } = await scanCatalog(start, library.media.map((item) => item.sourceUrl), analyzePublicPage)
      if (!listings.length) {
        updateLibrary((current) => {
          const cursors = { ...current.catalogCursors }
          if (cursor) cursors[source] = cursor
          else delete cursors[source]
          return { ...current, catalogCursors: cursors }
        })
        setNotice(cursor ? 'No new titles in this batch. Scan again to continue to later pages.' : 'No new titled links found. Some sites require an API or render their catalog in JavaScript.')
        return
      }
      const entries: MediaItem[] = []
      for (let offset = 0; offset < listings.length; offset += 3) {
        const batch = listings.slice(offset, offset + 3)
        const analyzed = await Promise.all(batch.map(async (listing) => {
          try {
            const result = await analyzePublicPage(listing.url)
            return toMediaItem({ ...result, title: result.title === new URL(listing.url).hostname ? listing.title : result.title, poster: result.poster ?? listing.poster }, { ...blankDraft, tags: draft.tags }, true)
          } catch {
            return toMediaItem({ ...analyzeUrl(listing.url), title: listing.title, poster: listing.poster }, { ...blankDraft, tags: draft.tags }, true)
          }
        }))
        entries.push(...analyzed)
      }
      updateLibrary((current) => {
        const existing = new Set(current.media.map((item) => item.sourceUrl))
        const cursors = { ...current.catalogCursors }
        if (cursor) cursors[source] = cursor
        else delete cursors[source]
        return { ...current, catalogCursors: cursors, media: [...entries.filter((item) => !existing.has(item.sourceUrl)), ...current.media] }
      })
      setView('library')
      setNotice(`Added ${entries.length} entries. Some may be links rather than playable videos; scan again for more titles.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not inspect the page.')
    } finally { setImporting(false) }
  }

  function removeMedia(id: string): void {
    updateLibrary((current) => ({
      ...current,
      media: current.media.filter((item) => item.id !== id),
      playlists: current.playlists.map((playlist) => ({ ...playlist, mediaIds: playlist.mediaIds.filter((mediaId) => mediaId !== id) })),
    }))
    if (activeId === id) setActiveId(undefined)
  }

  function addToWatchLater(id: string): void {
    updateLibrary((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) => playlist.id === 'watch-later' && !playlist.mediaIds.includes(id)
        ? { ...playlist, mediaIds: [...playlist.mediaIds, id] } : playlist),
    }))
    setNotice('Added to Watch later.')
  }

  function createPlaylist(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const name = playlistName.trim()
    if (!name) return
    const playlist: Playlist = { id: makeId('playlist'), name, mediaIds: activeId ? [activeId] : [], createdAt: new Date().toISOString() }
    updateLibrary((current) => ({ ...current, playlists: [playlist, ...current.playlists] }))
    setPlaylistName('')
    setNotice(activeId ? `Created ${name} with the selected title.` : `Created ${name}.`)
  }

  function updatePlaylist(playlistId: string, mediaId: string, add: boolean): void {
    updateLibrary((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) => playlist.id !== playlistId ? playlist : {
        ...playlist,
        mediaIds: add ? [...playlist.mediaIds, mediaId] : playlist.mediaIds.filter((id) => id !== mediaId),
      }),
    }))
  }

  function createChannel(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const name = channelName.trim()
    if (!name) return
    const channel: Channel = {
      id: makeId('channel'), name, filter: channelFilter.trim(), description: channelFilter ? `Always-on mix filtered by “${channelFilter}”.` : 'Always-on mix from your library.',
      accent: accents[(library?.channels.length ?? 0) % accents.length], anchor: new Date().toISOString(), durationHours: 24,
    }
    updateLibrary((current) => ({ ...current, channels: [channel, ...current.channels] }))
    setChannelName('')
    setChannelFilter('')
    setNotice(`${name} is now scheduled as a 24-hour virtual channel.`)
  }

  function playChannel(channel: Channel): void {
    const currentSlot = nowPlaying(allSchedules.get(channel.id) ?? [])
    if (!currentSlot) {
      setNotice('Add library items that match this channel filter first.')
      return
    }
    setActiveId(currentSlot.mediaId)
    setActivePlaylistId(undefined)
    setActiveChannelId(channel.id)
    setView('home')
    setNotice(`${channel.name} is live now.`)
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const imported = await importLibrary(file)
      setLibrary(imported)
      setActiveId(imported.media[0]?.id)
      setNotice('Library restored locally.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import that library file.')
    }
    event.target.value = ''
  }

  if (!library) return <main className="loading-screen"><span className="pulse-orb" /> Loading your private media library…</main>

  return (
    <main className="app-shell">
      <header className={`topbar ${window.vividWindow ? 'desktop-topbar' : ''}`}>
        <button className="brand" onClick={() => setView('home')} aria-label="Go home">
          <span className="brand-mark">V</span><span>Vivid</span>
        </button>
        <nav aria-label="Main navigation">
          {(['home', 'library', 'playlists', 'channels', 'settings'] as View[]).map((name) => (
            <button key={name} className={view === name ? 'nav-active' : ''} onClick={() => setView(name)}>{name}</button>
          ))}
        </nav>
        <div className="status-pill"><span /> Local-first library</div>
        {window.vividWindow && <div className="window-controls" aria-label="Window controls">
          <button aria-label="Minimize window" title="Minimize" onClick={() => window.vividWindow?.minimize()}>−</button>
          <button aria-label="Maximize or restore window" title="Maximize or restore" onClick={() => window.vividWindow?.toggleMaximize()}>□</button>
          <button className="window-close" aria-label="Close window" title="Close" onClick={() => window.vividWindow?.close()}>×</button>
        </div>}
      </header>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}

      {view === 'home' && <>
        <section className="hero-grid">
          <div className="player-panel">
            <div className="section-eyebrow">NOW PLAYING</div>
            <PlayerSurface key={activeChannelId ? channelSlotId : activeId} item={active} onEnded={activePlaylist ? nextInPlaylist : undefined} autoPlay={Boolean(activePlaylist || activeChannelId)} slotStart={activeChannelId ? channelSlotStart : undefined} />
            <div className="now-playing-meta">
              <div>
                <h1>{active?.title ?? 'Your media, one screen.'}</h1>
                {active && <p>{providerLabel(active.provider)} · {active.kind} · {formatRuntime(active.durationSeconds)}</p>}
                {active && safeExternalUrl(active.sourceUrl) && <a className="text-button" href={safeExternalUrl(active.sourceUrl)} target="_blank" rel="noopener noreferrer">Open original source ↗</a>}
              </div>
              {active && <div>{activePlaylist && <button className="secondary-button" onClick={nextInPlaylist}>Next in {activePlaylist.name} →</button>} <button className="secondary-button" onClick={() => addToWatchLater(active.id)}>＋ Watch later</button></div>}
            </div>
          </div>
          <aside className="import-card">
            <div className="section-eyebrow">UNIVERSAL IMPORTER</div>
            <h2>Paste a source. Build your world.</h2>
            <p>Single videos, playlists, channels, permitted public pages, direct streams, Plex sources, YouTube, Twitch, and Cloudflare Stream.</p>
            <form onSubmit={handleImport} className="import-form">
              <label>Source URL<input required type="url" placeholder="https://…" value={draft.url} onChange={(event) => updateDraft('url', event.target.value)} /></label>
              <label>Title override <span>optional</span><input placeholder="Autodetected when available" value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} /></label>
              <div className="form-row">
                <label>Tags<input placeholder="sci-fi, comedy" value={draft.tags} onChange={(event) => updateDraft('tags', event.target.value)} /></label>
                <label>Actors<input placeholder="names, comma-separated" value={draft.actors} onChange={(event) => updateDraft('actors', event.target.value)} /></label>
              </div>
              <div className="form-row">
                <label>Franchise<input placeholder="e.g. Planet Earth" value={draft.franchise} onChange={(event) => updateDraft('franchise', event.target.value)} /></label>
                <label>Series<input placeholder="e.g. Season 1" value={draft.series} onChange={(event) => updateDraft('series', event.target.value)} /></label>
              </div>
              <div className="form-row compact-fields">
                <label>Season<input min="1" inputMode="numeric" placeholder="#" value={draft.season} onChange={(event) => updateDraft('season', event.target.value)} /></label>
                <label>Episode<input min="1" inputMode="numeric" placeholder="#" value={draft.episode} onChange={(event) => updateDraft('episode', event.target.value)} /></label>
              </div>
              <label>Runtime in minutes <span>optional; used for channel scheduling</span><input type="number" min="1" max="1440" placeholder="15" value={draft.durationMinutes} onChange={(event) => updateDraft('durationMinutes', event.target.value)} /></label>
              <label className="checkbox-row"><input type="checkbox" checked={pageAnalysis} onChange={(event) => setPageAnalysis(event.target.checked)} /> Analyze permitted public-page metadata</label>
              <button className="primary-button" disabled={importing}>{importing ? 'Analyzing…' : 'Analyze & import'}</button>
              <button type="button" className="secondary-button" disabled={importing} onClick={importPageListings}>Import titles listed on this page</button>
            </form>
            <p className="fine-print">Vivid saves original source URLs. It does not copy, proxy, DRM-bypass, or rebroadcast media.</p>
            <p className="fine-print">When page analysis is enabled, the URL is sent to the Vivid analysis service.</p>
          </aside>
        </section>

        <section className="content-section">
          <div className="section-heading"><div><span className="section-eyebrow">YOUR LIBRARY</span><h2>Continue watching</h2></div><button className="text-button" onClick={() => setView('library')}>Open library →</button></div>
          <MediaGrid media={library.media.slice(0, 6)} activeId={activeId} onPlay={(id) => { setActiveChannelId(undefined); setActivePlaylistId(undefined); setActiveId(id); setView('home') }} onRemove={removeMedia} />
        </section>
      </>}

      {view === 'library' && <section className="content-section library-view">
        <div className="section-heading"><div><span className="section-eyebrow">PRIVATE CATALOG</span><h1>Library</h1></div><input className="search-input" placeholder="Search title, actor, franchise, tag…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="filter-summary">{visibleMedia.length} item{visibleMedia.length === 1 ? '' : 's'} · Stored in this browser</div>
        <MediaGrid media={visibleMedia} activeId={activeId} onPlay={(id) => { setActiveChannelId(undefined); setActivePlaylistId(undefined); setActiveId(id); setView('home') }} onRemove={removeMedia} />
      </section>}

      {view === 'playlists' && <section className="content-section">
        <div className="section-heading"><div><span className="section-eyebrow">CURATED QUEUES</span><h1>Playlists</h1></div></div>
        <form className="inline-form" onSubmit={createPlaylist}><input value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} placeholder="New playlist name" /><button className="primary-button">Create playlist</button></form>
        <div className="playlist-grid">
          {library.playlists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} media={library.media} onChange={(id, add) => updatePlaylist(playlist.id, id, add)} onPlay={(id) => { setActiveChannelId(undefined); setActivePlaylistId(playlist.id); setActiveId(id); setView('home') }} />)}
        </div>
      </section>}

      {view === 'channels' && <section className="content-section">
        <div className="section-heading"><div><span className="section-eyebrow">VIRTUAL LINEAR TV</span><h1>24/7 networks</h1></div></div>
        <p className="channel-intro">Build continuous schedules from your saved library. A channel chooses the right item for the current time; it does not copy or rebroadcast source media.</p>
        <form className="inline-form channel-form" onSubmit={createChannel}><input value={channelName} onChange={(event) => setChannelName(event.target.value)} placeholder="Channel name" /><input value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} placeholder="Optional filter: actor, franchise, tag…" /><button className="primary-button">Launch 24/7 channel</button></form>
        <div className="channel-grid">
          {library.channels.map((channel) => <ChannelCard key={channel.id} channel={channel} media={library.media} clock={clock} onPlay={() => playChannel(channel)} />)}
          {!library.channels.length && <div className="empty-state">Create a channel such as “Saturday Sci-Fi,” “Action by Keanu,” or “Live Creator Loop.”</div>}
        </div>
      </section>}

      {view === 'settings' && <section className="content-section settings-view">
        <span className="section-eyebrow">DATA & PROVIDERS</span><h1>Your library stays yours.</h1>
        <div className="settings-grid">
          <article><h3>Export backup</h3><p>Download your library, metadata, playlists, and channels as JSON.</p><button className="secondary-button" onClick={() => exportLibrary(library)}>Export library</button></article>
          <article><h3>Import backup</h3><p>Restore a Vivid library export into this browser.</p><input ref={importInput} className="visually-hidden" type="file" accept="application/json" onChange={handleImportFile} /><button className="secondary-button" onClick={() => importInput.current?.click()}>Import library</button></article>
          <article><h3>Cloudflare Stream</h3><p>Paste a Cloudflare Stream player, video, live-input, or manifest URL into the importer. Stream tokens stay out of this public app.</p></article>
          <article><h3>Catalog expansion</h3><p>For an entire YouTube channel, Plex library, or website catalog, connect an approved API, RSS feed, sitemap, or owned-server index in a later provider sync.</p></article>
        </div>
      </section>}
    </main>
  )
}

interface MediaGridProps {
  media: MediaItem[]
  activeId?: string
  onPlay: (id: string) => void
  onRemove: (id: string) => void
}

function MediaGrid({ media, activeId, onPlay, onRemove }: MediaGridProps) {
  if (!media.length) return <div className="empty-state">Nothing here yet. Import a source to start building your collection.</div>
  return <div className="media-grid">{media.map((item) => <article key={item.id} className={`media-card ${item.id === activeId ? 'is-active' : ''}`}>
    <button className="card-play" onClick={() => onPlay(item.id)} aria-label={`Play ${item.title}`}>
      {item.poster ? <img src={item.poster} alt="" /> : <div className={`poster-fallback provider-${item.provider}`}>{sourceGlyph(item.provider)}</div>}
      <span className="play-circle">▶</span>
    </button>
    <div className="card-meta"><div><span className="provider-badge">{sourceGlyph(item.provider)} {providerLabel(item.provider)}</span><h3>{item.title}</h3><p>{item.franchise || item.series || item.tags.slice(0, 2).join(' · ') || item.kind}</p></div><button className="remove-button" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.title}`}>×</button></div>
  </article>)}</div>
}

function PlaylistCard({ playlist, media, onPlay, onChange }: { playlist: Playlist; media: MediaItem[]; onPlay: (id: string) => void; onChange: (id: string, add: boolean) => void }) {
  const entries = playlist.mediaIds.map((id) => media.find((item) => item.id === id)).filter((item): item is MediaItem => Boolean(item))
  return <article className="playlist-card"><div className="playlist-cover"><span>≋</span></div><div><span className="section-eyebrow">PLAYLIST</span><h2>{playlist.name}</h2><p>{entries.length} saved title{entries.length === 1 ? '' : 's'}</p>{entries[0] && <button className="text-button" onClick={() => onPlay(entries[0].id)}>Play first →</button>}<details><summary>Edit titles</summary>{media.map((item) => <label className="checkbox-row" key={item.id}><input type="checkbox" checked={playlist.mediaIds.includes(item.id)} onChange={(event) => onChange(item.id, event.target.checked)} /> {item.title}</label>)}</details></div></article>
}

function ChannelCard({ channel, media, clock, onPlay }: { channel: Channel; media: MediaItem[]; clock: Date; onPlay: () => void }) {
  const schedule = makeSchedule(channel, media, clock)
  const live = nowPlaying(schedule, clock)
  const liveItem = live ? media.find((item) => item.id === live.mediaId) : undefined
  return <article className="channel-card" style={{ '--accent': channel.accent } as CSSProperties}>
    <div className="channel-signal"><span /> LIVE</div>
    <h2>{channel.name}</h2><p>{channel.description}</p>
    {live && liveItem ? <div className="live-program"><span>Now</span><strong>{liveItem.title}</strong><small>{formatClock(live.startsAt)} – {formatClock(live.endsAt)}</small></div> : <div className="live-program muted">No matching titles yet</div>}
    <button className="primary-button" onClick={onPlay}>{live ? 'Join live' : 'Set up library'}</button>
  </article>
}
