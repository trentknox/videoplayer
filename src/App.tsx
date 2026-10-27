import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import PlayerSurface from './PlayerSurface'
import { exportLibrary, importLibrary, loadLibrary, saveLibrary } from './library'
import { analyzePublicPage, analyzeUrl, enrichYouTubeItem } from './providers'
import { scanCatalog } from './catalogScan'
import { advanceCatalogJob } from './catalogJob'
import { movePlaylistItem } from './playlist'
import { dueSource } from './sources'
import { defaultFilters, filterLibrary } from './filters'
import { adjacentChannel } from './channelNavigation'
import { startUpdateMonitor } from './updateMonitor'
import type { LibraryFilters } from './filters'
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
    playerOptions: analysis.playerOptions,
    externalId: analysis.externalId,
    title: draft.title.trim() || analysis.title,
    description: analysis.description,
    contentType: analysis.contentType ?? (draft.episode ? 'episode' : undefined),
    contentRating: analysis.contentRating,
    genres: analysis.genres,
    countries: analysis.countries,
    year: analysis.year,
    rating: analysis.rating,
    budgetUsd: analysis.budgetUsd,
    revenueUsd: analysis.revenueUsd,
    poster: analysis.poster,
    durationSeconds: draft.durationMinutes ? Number(draft.durationMinutes) * 60 : analysis.durationSeconds ?? 900,
    tags: splitList(draft.tags),
    franchise: draft.franchise.trim() || undefined,
    series: draft.series.trim() || undefined,
    season: draft.season ? Number(draft.season) : undefined,
    episode: draft.episode ? Number(draft.episode) : undefined,
    actors: [...new Set([...splitList(draft.actors), ...(analysis.actors ?? [])])],
    addedAt: new Date().toISOString(),
    importMode: pageAnalysis ? 'page-analysis' : analysis.kind === 'playlist' ? 'playlist' : analysis.kind === 'channel' ? 'channel' : analysis.kind === 'catalog' ? 'catalog' : 'single',
  }
}

export default function App() {
  const [library, setLibrary] = useState<LibraryState | null>(null)
  const [activeId, setActiveId] = useState<string>()
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [activePlaylistId, setActivePlaylistId] = useState<string>()
  const [activeChannelId, setActiveChannelId] = useState<string>()
  const [channelSlotId, setChannelSlotId] = useState<string>()
  const [channelSlotStart, setChannelSlotStart] = useState<string>()
  const [view, setView] = useState<View>('home')
  const [draft, setDraft] = useState<ImportDraft>(blankDraft)
  const [pageAnalysis, setPageAnalysis] = useState(true)
  const [importing, setImporting] = useState(false)
  const [scanningCatalog, setScanningCatalog] = useState(false)
  const [catalogSections, setCatalogSections] = useState<Array<{ url: string; title: string }>>([])
  const [notice, setNotice] = useState('')
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [search, setSearch] = useState('')
  const [homeSearch, setHomeSearch] = useState('')
  const [filters, setFilters] = useState<LibraryFilters>(defaultFilters)
  const [playlistName, setPlaylistName] = useState('')
  const [deletedPlaylist, setDeletedPlaylist] = useState<{ playlist: Playlist; index: number }>()
  const [channelName, setChannelName] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [clock, setClock] = useState(() => new Date())
  const importInput = useRef<HTMLInputElement>(null)
  const playerPanel = useRef<HTMLDivElement>(null)
  const stopCatalogImport = useRef(false)
  const sourceSyncLock = useRef(false)
  const importingRef = useRef(false)
  importingRef.current = importing

  useEffect(() => startUpdateMonitor(() => setUpdateAvailable(true), () => importingRef.current), [])

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
  const activePlayer = useMemo(() => {
    const option = active?.playerOptions?.find((entry) => entry.url === selectedPlayer)
    return active && option ? { ...active, embedUrl: option.url } : active
  }, [active, selectedPlayer])
  useEffect(() => { setSelectedPlayer('') }, [activeId])
  useEffect(() => {
    if (!library || importing || sourceSyncLock.current) return
    const source = dueSource(library, clock.getTime())
    if (!source) return
    sourceSyncLock.current = true
    updateLibrary((current) => ({ ...current, sources: current.sources?.map((entry) => entry.id === source.id ? { ...entry, lastChecked: new Date().toISOString() } : entry) }))
    void importPageListings({ sourceUrl: source.url, background: true }).finally(() => { sourceSyncLock.current = false })
  }, [library, importing, clock])
  const activePlaylist = library?.playlists.find((playlist) => playlist.id === activePlaylistId)
  const visibleMedia = useMemo(() => {
    if (!library) return []
    return filterLibrary(library.media, { ...filters, query: search })
  }, [library, search, filters])
  const homeGallery = useMemo(() => {
    if (!library) return []
    return filterLibrary(library.media, { ...defaultFilters, query: homeSearch, sort: 'rating', order: 'desc' }).slice(0, 12)
  }, [library, homeSearch])

  const allSchedules = useMemo(() => {
    if (!library) return new Map<string, ReturnType<typeof makeSchedule>>()
    return new Map(library.channels.map((channel) => [channel.id, makeSchedule(channel, library.media, clock, library.playlists)]))
  }, [library, clock])

  useEffect(() => {
    if (!activeChannelId || !library) return
    const channel = library.channels.find((entry) => entry.id === activeChannelId)
    if (!channel) return
    let timer: number | undefined
    const update = () => {
      const now = new Date()
      const slot = nowPlaying(makeSchedule(channel, library.media, now, library.playlists), now)
      if (!slot) return
      setActiveId(slot.mediaId)
      setChannelSlotId(slot.id)
      setChannelSlotStart(slot.startsAt)
      timer = window.setTimeout(update, Math.max(100, new Date(slot.endsAt).getTime() - now.getTime() + 50))
    }
    update()
    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [activeChannelId, library])

  useEffect(() => {
    if (!activeChannelId || !library || view !== 'home') return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))) return
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      const channel = adjacentChannel(library.channels, activeChannelId, event.key === 'ArrowUp' ? -1 : 1)
      if (!channel) return
      event.preventDefault()
      playChannel(channel)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeChannelId, library, view, allSchedules])

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
        if (existing && !analysis.analysisUnavailable && (analysis.playerOptions?.length || (existing.kind === 'catalog' && analysis.kind === 'video'))) {
          updateLibrary((current) => ({ ...current, media: current.media.map((item) => item.id === existing.id
            ? { ...item, provider: analysis.provider, kind: analysis.kind, embedUrl: analysis.embedUrl, playerOptions: analysis.playerOptions } : item) }))
          setNotice('Refreshed the available players for this title.')
        } else {
          setNotice('That source is already in your library.')
        }
        setActiveId(existing?.id)
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

  async function importPageListings(options?: { sourceUrl: string; background: boolean }): Promise<void> {
    const importDraft = options?.background ? { ...blankDraft, url: options.sourceUrl } : draft
    if (!library || !importDraft.url.trim()) { setNotice('Enter a website URL first.'); return }
    setImporting(true)
    stopCatalogImport.current = false
    setScanningCatalog(true)
    setCatalogSections([])
    setNotice('Looking for titles on this page…')
    try {
      const source = new URL(importDraft.url).href
      if (options?.background) {
        const initial = await analyzePublicPage(source)
        if (initial.analysisUnavailable) throw new Error('Source refresh failed; Vivid will retry later.')
        if (initial.provider !== 'embed' || (initial.kind === 'video' && !initial.listings?.length)) {
          const enriched = await enrichYouTubeItem(initial)
          const item = toMediaItem(enriched, importDraft, true)
          updateLibrary((current) => current.media.some((entry) => entry.sourceUrl === item.sourceUrl) ? current : { ...current, media: [item, ...current.media] })
          setNotice('Saved source refreshed.')
          return
        }
      }
      let job = library.catalogJobs?.[source] ?? { current: library.catalogCursors?.[source] ?? source, pending: [], seen: [source] }
      let start = job.current
      const known = new Set(library.media.map((item) => item.sourceUrl))
      const emptyCursors = new Set<string>()
      let added = 0
      let batches = 0
      while (start && !stopCatalogImport.current && batches < 40) {
        const { listings, cursor, sections } = await scanCatalog(start, known, analyzePublicPage)
        if (sections.length) setCatalogSections((existing) => [...new Map([...existing, ...sections].map((section) => [section.url, section])).values()])
        if (!listings.length && emptyCursors.has(start)) {
          setNotice(`Added ${added} titles. Pagination repeated; scan stopped at ${start}.`)
          return
        }
        if (!listings.length) emptyCursors.add(start)
        else emptyCursors.clear()
        const entries: MediaItem[] = []
        const nestedSeries: Array<{ url: string; series: string }> = []
        for (let offset = 0; offset < listings.length; offset += 3) {
          const batch = listings.slice(offset, offset + 3)
          const analyzed = await Promise.all(batch.map(async (listing) => {
            try {
              const result = await analyzePublicPage(listing.url)
              if (result.listings?.some((entry) => entry.season !== undefined && entry.episode !== undefined)) nestedSeries.push({ url: listing.url, series: listing.title })
              return toMediaItem({ ...result, title: result.title === new URL(listing.url).hostname ? listing.title : result.title, poster: result.poster ?? listing.poster }, { ...blankDraft, tags: importDraft.tags, series: importDraft.series || job.seriesNames?.[start!] || '', season: listing.season?.toString() ?? importDraft.season, episode: listing.episode?.toString() ?? importDraft.episode }, true)
            } catch {
              return toMediaItem({ ...analyzeUrl(listing.url), title: listing.title, poster: listing.poster }, { ...blankDraft, tags: importDraft.tags, series: importDraft.series || job.seriesNames?.[start!] || '', season: listing.season?.toString() ?? importDraft.season, episode: listing.episode?.toString() ?? importDraft.episode }, true)
            }
          }))
          entries.push(...analyzed)
        }
        for (const item of entries) known.add(item.sourceUrl)
        job = advanceCatalogJob(source, job, cursor, [...sections, ...nestedSeries])
        const savedJob = job
        updateLibrary((current) => {
          const existing = new Set(current.media.map((item) => item.sourceUrl))
          const cursors = { ...current.catalogCursors }
          delete cursors[source]
          const jobs = { ...current.catalogJobs }
          if (savedJob.current) jobs[source] = savedJob
          else delete jobs[source]
          return { ...current, catalogCursors: cursors, catalogJobs: jobs, media: [...entries.filter((item) => !existing.has(item.sourceUrl)), ...current.media] }
        })
        added += entries.length
        batches += 1
        start = job.current
        setNotice(`Added ${added} titles. ${start ? 'Scanning more pages…' : 'Scan complete.'}`)
      }
      if (added && !options?.background) setView('library')
      setNotice(`Added ${added} titles. ${start ? 'Scan paused; import again to continue.' : 'Scan complete.'} Some entries may be website links rather than playable videos.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not inspect the page.')
    } finally { setImporting(false); setScanningCatalog(false) }
  }

  function addSource(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      const url = new URL(sourceUrl.trim())
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS URL without credentials.')
      url.hash = ''
      if (library?.sources?.some((source) => source.url === url.href)) throw new Error('That source is already saved.')
      updateLibrary((current) => ({ ...current, sources: [...(current.sources ?? []), { id: makeId('source'), url: url.href }] }))
      setSourceUrl('')
      setNotice('Source saved. Its first refresh will start shortly.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Enter a valid source URL.') }
  }

  function removeMedia(id: string): void {
    updateLibrary((current) => ({
      ...current,
      media: current.media.filter((item) => item.id !== id),
      playlists: current.playlists.map((playlist) => ({ ...playlist, mediaIds: playlist.mediaIds.filter((mediaId) => mediaId !== id) })),
    }))
    if (activeId === id) setActiveId(undefined)
  }

  function playFromLibrary(id: string): void {
    const item = library?.media.find((entry) => entry.id === id)
    setActiveChannelId(undefined)
    setActivePlaylistId(undefined)
    setActiveId(id)
    setView('home')
    window.requestAnimationFrame(() => playerPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    if (!item) return
    let needsRefresh = item.kind === 'catalog'
    try { needsRefresh ||= new URL(item.sourceUrl).hostname.toLowerCase() === '1movies.stream' } catch { /* Invalid links remain saved. */ }
    if (!needsRefresh) return
    setNotice('Checking for an available player…')
    void analyzePublicPage(item.sourceUrl).then((result) => {
      if (result.kind !== 'video' || result.analysisUnavailable) { setNotice('No player was found for this title.'); return }
      updateLibrary((current) => ({ ...current, media: current.media.map((entry) => entry.id === id
        ? { ...entry, provider: result.provider, kind: result.kind, embedUrl: result.embedUrl, playerOptions: result.playerOptions, contentType: result.contentType ?? entry.contentType, contentRating: result.contentRating ?? entry.contentRating, genres: result.genres?.length ? result.genres : entry.genres, countries: result.countries?.length ? result.countries : entry.countries, year: result.year ?? entry.year, rating: result.rating ?? entry.rating, budgetUsd: result.budgetUsd ?? entry.budgetUsd, revenueUsd: result.revenueUsd ?? entry.revenueUsd, actors: [...new Set([...entry.actors, ...(result.actors ?? [])])] } : entry) }))
      setNotice('Player refreshed. Playback depends on the provider.')
    }).catch(() => setNotice('Could not refresh this player.'))
  }

  function addToWatchLater(id: string): void {
    updateLibrary((current) => ({
      ...current,
      playlists: current.playlists.some((playlist) => playlist.id === 'watch-later') ? current.playlists.map((playlist) => playlist.id === 'watch-later' && !playlist.mediaIds.includes(id)
        ? { ...playlist, mediaIds: [...playlist.mediaIds, id] } : playlist) : [{ id: 'watch-later', name: 'Watch later', mediaIds: [id], createdAt: new Date().toISOString() }, ...current.playlists],
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

  function moveInPlaylist(playlistId: string, mediaId: string, direction: -1 | 1): void {
    updateLibrary((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) => playlist.id === playlistId
        ? { ...playlist, mediaIds: movePlaylistItem(playlist.mediaIds, mediaId, direction) } : playlist),
    }))
  }

  function deletePlaylist(playlist: Playlist): void {
    if (!library) return
    setDeletedPlaylist({ playlist, index: library.playlists.findIndex((entry) => entry.id === playlist.id) })
    updateLibrary((current) => ({ ...current,
      playlists: current.playlists.filter((entry) => entry.id !== playlist.id),
      channels: current.channels.map((channel) => channel.playlistId === playlist.id ? { ...channel, playlistId: undefined, mediaIds: [...playlist.mediaIds] } : channel),
    }))
    if (activePlaylistId === playlist.id) setActivePlaylistId(undefined)
    setNotice(`Deleted ${playlist.name}. Its videos and channels remain.`)
  }

  function undoPlaylistDelete(): void {
    if (!deletedPlaylist) return
    const { playlist, index } = deletedPlaylist
    updateLibrary((current) => {
      if (current.playlists.some((entry) => entry.id === playlist.id)) return current
      const playlists = [...current.playlists]
      playlists.splice(Math.max(0, index), 0, playlist)
      return { ...current, playlists }
    })
    setDeletedPlaylist(undefined)
    setNotice(`Restored ${playlist.name}. Channels keep their saved order.`)
  }

  function createChannelFromPlaylist(playlist: Playlist): void {
    if (!library || !playlist.mediaIds.some((id) => library.media.some((item) => item.id === id))) return
    const channel: Channel = { id: makeId('channel'), name: playlist.name, description: `Loops the ${playlist.name} playlist in order.`, filter: '', accent: accents[library.channels.length % accents.length], anchor: new Date().toISOString(), durationHours: 24, playlistId: playlist.id }
    updateLibrary((current) => ({ ...current, channels: [channel, ...current.channels] }))
    setClock(new Date())
    setNotice(`${playlist.name} is now a looping channel. Changes to the playlist update its schedule.`)
    setView('channels')
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
    setClock(new Date())
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
    window.requestAnimationFrame(() => playerPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
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
      {updateAvailable && <div className="notice" role="status">A Vivid update is ready. It will load automatically when the player is idle. <button onClick={() => window.location.reload()}>Update now</button></div>}
      <div hidden={view !== 'settings'}><InstallApp /></div>

      {view === 'home' && <>
        <section className="content-section home-gallery">
          <div className="section-heading"><div><span className="section-eyebrow">YOUR MEDIA</span><h1>Find something to watch</h1><p>Browse your library, or search by title, actor, genre, or series.</p></div>
            <form className="home-search" onSubmit={(event) => { event.preventDefault(); setSearch(homeSearch); setView('library') }}><input aria-label="Search your library" value={homeSearch} onChange={(event) => setHomeSearch(event.target.value)} placeholder="Search your library…" /><button className="primary-button">Search</button></form>
          </div>
          <h2>Explore your library</h2>
          <MediaGrid media={homeGallery} activeId={activeId} onPlay={playFromLibrary} onRemove={removeMedia} />
        </section>
        <section className="hero-grid">
          <div className="player-panel" ref={playerPanel}>
            <div className="section-eyebrow">NOW PLAYING</div>
            <PlayerSurface key={activeChannelId ? channelSlotId : activeId} item={activePlayer} onEnded={activePlaylist ? nextInPlaylist : undefined} autoPlay={Boolean(activePlaylist || activeChannelId)} slotStart={activeChannelId ? channelSlotStart : undefined} />
            <div className="now-playing-meta">
              <div>
                <h1>{active?.title ?? 'Your media, one screen.'}</h1>
                {active && <p>{providerLabel(active.provider)} · {active.kind} · {formatRuntime(active.durationSeconds)}</p>}
                {active && (active.playerOptions?.length ?? 0) > 1 && <label>Player <select value={selectedPlayer || active.embedUrl} onChange={(event) => setSelectedPlayer(event.target.value)}>{active.playerOptions?.map((option) => <option key={option.url} value={option.url}>{option.name}</option>)}</select></label>}
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
              <button type="button" className="secondary-button" disabled={importing} onClick={() => void importPageListings()}>Import titles listed on this page</button>
              {scanningCatalog && <button type="button" className="secondary-button" onClick={() => { stopCatalogImport.current = true; setNotice('Stopping after the current batch…') }}>Stop catalog scan</button>}
            </form>
            {catalogSections.length > 0 && <div><p>More catalog sections found. Select one, then import its titles:</p>{catalogSections.map((section) => <button type="button" className="secondary-button" key={section.url} disabled={importing} onClick={() => updateDraft('url', section.url)}>{section.title}</button>)}</div>}
            <p className="fine-print">Vivid saves original source URLs. It does not copy, proxy, DRM-bypass, or rebroadcast media.</p>
            <p className="fine-print">When page analysis is enabled, the URL is sent to the Vivid analysis service.</p>
          </aside>
        </section>

        <section className="content-section">
          <div className="section-heading"><div><span className="section-eyebrow">YOUR LIBRARY</span><h2>Continue watching</h2></div><button className="text-button" onClick={() => setView('library')}>Open library →</button></div>
          <MediaGrid media={library.media.slice(0, 6)} activeId={activeId} onPlay={playFromLibrary} onRemove={removeMedia} />
        </section>
      </>}

      {view === 'library' && <section className="content-section library-view">
        <div className="section-heading"><div><span className="section-eyebrow">PRIVATE CATALOG</span><h1>Library</h1></div><input className="search-input" placeholder="Search title, actor, franchise, tag…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="library-filters">
          <label>Type<select value={filters.type} onChange={(event) => setFilters((value) => ({ ...value, type: event.target.value }))}><option value="">All types</option><option value="movie">Movies</option><option value="series">Series</option><option value="episode">Episodes</option></select></label>
          <label>Genre<select aria-label="Genre" value={filters.genre} onChange={(event) => setFilters((value) => ({ ...value, genre: event.target.value }))}><option value="">All genres</option>{[...new Set(library.media.flatMap((item) => item.genres ?? []))].sort().map((genre) => <option key={genre}>{genre}</option>)}</select></label>
          <label>Country<select value={filters.country} onChange={(event) => setFilters((value) => ({ ...value, country: event.target.value }))}><option value="">All countries</option>{[...new Set(library.media.flatMap((item) => item.countries ?? []))].sort().map((country) => <option key={country}>{country}</option>)}</select></label>
          <label>Year<select value={filters.year} onChange={(event) => setFilters((value) => ({ ...value, year: event.target.value }))}><option value="">All years</option>{[...new Set(library.media.flatMap((item) => item.year ? [item.year] : []))].sort((a, b) => b - a).map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
          <label>Sort<select value={filters.sort} onChange={(event) => setFilters((value) => ({ ...value, sort: event.target.value as LibraryFilters['sort'] }))}><option value="added">Date added</option><option value="title">Title</option><option value="year">Year</option><option value="rating">Source rating</option><option value="budget">Budget (USD)</option><option value="revenue">Revenue (USD)</option></select></label>
          <label>Order<select value={filters.order} onChange={(event) => setFilters((value) => ({ ...value, order: event.target.value as LibraryFilters['order'] }))}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
          <button className="secondary-button" onClick={() => { setFilters(defaultFilters); setSearch('') }}>Clear</button>
        </div>
        <div className="filter-summary">{visibleMedia.length} item{visibleMedia.length === 1 ? '' : 's'} · Stored in this browser</div>
        <MediaGrid media={visibleMedia} activeId={activeId} onPlay={playFromLibrary} onRemove={removeMedia} />
      </section>}

      {view === 'playlists' && <section className="content-section">
        <div className="section-heading"><div><span className="section-eyebrow">CURATED QUEUES</span><h1>Playlists</h1></div></div>
        <form className="inline-form" onSubmit={createPlaylist}><input value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} placeholder="New playlist name" /><button className="primary-button">Create playlist</button></form>
        {deletedPlaylist && <button className="secondary-button" onClick={undoPlaylistDelete}>Undo delete of {deletedPlaylist.playlist.name}</button>}
        <div className="playlist-grid">
          {library.playlists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} media={library.media} onDelete={() => deletePlaylist(playlist)} onCreateChannel={() => createChannelFromPlaylist(playlist)} onRename={(name) => updateLibrary((current) => ({ ...current, playlists: current.playlists.map((entry) => entry.id === playlist.id ? { ...entry, name } : entry) }))} onChange={(id, add) => updatePlaylist(playlist.id, id, add)} onMove={(id, direction) => moveInPlaylist(playlist.id, id, direction)} onPlay={(id) => { setActiveChannelId(undefined); setActivePlaylistId(playlist.id); setActiveId(id); setView('home') }} />)}
        </div>
      </section>}

      {view === 'channels' && <section className="content-section">
        <div className="section-heading"><div><span className="section-eyebrow">VIRTUAL LINEAR TV</span><h1>24/7 networks</h1></div></div>
        <p className="channel-intro">Build continuous schedules from your saved library. A channel chooses the right item for the current time; it does not copy or rebroadcast source media.</p>
        <form className="inline-form channel-form" onSubmit={createChannel}><input value={channelName} onChange={(event) => setChannelName(event.target.value)} placeholder="Channel name" /><input value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} placeholder="Optional filter: actor, franchise, tag…" /><button className="primary-button">Launch 24/7 channel</button></form>
        {library.channels.length > 0 && <section aria-label="Channel guide" className="channel-guide"><h2>Channel guide</h2><p>What’s on now and coming up. Use ↑ and ↓ while watching to change channels.</p>
          {library.channels.map((channel) => {
            const slots = allSchedules.get(channel.id) ?? []
            const live = nowPlaying(slots, clock)
            const index = live ? slots.findIndex((slot) => slot.id === live.id) : -1
            const upcoming = index >= 0 ? slots.slice(index, index + 3) : []
            return <div className="guide-row" key={channel.id}><button className="secondary-button" onClick={() => playChannel(channel)}>{channel.name}</button><div className="guide-programs">{upcoming.length ? upcoming.map((slot, slotIndex) => <div key={slot.id}><span>{slotIndex === 0 ? 'NOW' : formatClock(slot.startsAt)}</span><strong>{library.media.find((item) => item.id === slot.mediaId)?.title ?? 'Unavailable title'}</strong></div>) : <div>No matching titles</div>}</div></div>
          })}
        </section>}
        <div className="channel-grid">
          {library.channels.map((channel) => <ChannelCard key={channel.id} channel={channel} media={library.media} playlists={library.playlists} clock={clock} onPlay={() => playChannel(channel)} />)}
          {!library.channels.length && <div className="empty-state">Create a channel such as “Saturday Sci-Fi,” “Action by Keanu,” or “Live Creator Loop.”</div>}
        </div>
      </section>}

      {view === 'settings' && <section className="content-section settings-view">
        <span className="section-eyebrow">DATA & PROVIDERS</span><h1>Your library stays yours.</h1>
        <section className="content-section"><h2>Sources</h2><p>Saved sources refresh when Vivid is open, then about every six hours. New titles appear on Home. Catalog scans may take multiple batches; links are sent to Vivid’s analysis service.</p>
          <form className="inline-form" onSubmit={addSource}><input aria-label="Source URL to save" type="url" required value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /><button className="primary-button">Add source</button></form>
          {(library.sources ?? []).map((source) => <div key={source.id}><span>{source.url}</span> <button className="text-button" onClick={() => updateLibrary((current) => ({ ...current, sources: current.sources?.filter((entry) => entry.id !== source.id) }))}>Remove source</button></div>)}
        </section>
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

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

function InstallApp() {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt>()
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches)
  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt) }
    const onInstalled = () => { setInstalled(true); setInstallPrompt(undefined) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  if (window.vividWindow) return null
  return <section className="content-section"><h2>Install Vivid</h2>
    {installed ? <p>Vivid is running as an installed app.</p> : <><p>Install Vivid for its own window. It uses this browser profile’s library and loads the current web version when opened.</p>
      {installPrompt ? <button className="secondary-button" onClick={() => { void installPrompt.prompt().then(() => installPrompt.userChoice).then(() => setInstallPrompt(undefined)) }}>Install Vivid</button>
        : <p>In Microsoft Edge, open the browser menu, choose Apps, then choose Install this site as an app.</p>}</>}
  </section>
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

function PlaylistCard({ playlist, media, onPlay, onChange, onMove, onDelete, onCreateChannel, onRename }: { playlist: Playlist; media: MediaItem[]; onPlay: (id: string) => void; onChange: (id: string, add: boolean) => void; onMove: (id: string, direction: -1 | 1) => void; onDelete: () => void; onCreateChannel: () => void; onRename: (name: string) => void }) {
  const [name, setName] = useState(playlist.name)
  const entries = playlist.mediaIds.map((id) => media.find((item) => item.id === id)).filter((item): item is MediaItem => Boolean(item))
  return <article className="playlist-card"><div className="playlist-cover"><span>≋</span></div><div><span className="section-eyebrow">PLAYLIST</span><h2>{playlist.name}</h2><p>{entries.length} saved title{entries.length === 1 ? '' : 's'}</p>{entries[0] && <button className="text-button" onClick={() => onPlay(entries[0].id)}>Play first →</button>}
    {entries.length > 0 && <ol>{entries.map((item, index) => <li key={item.id}>{item.title} <button type="button" className="text-button" disabled={index === 0} aria-label={`Move ${item.title} earlier`} onClick={() => onMove(item.id, -1)}>↑</button> <button type="button" className="text-button" disabled={index === entries.length - 1} aria-label={`Move ${item.title} later`} onClick={() => onMove(item.id, 1)}>↓</button></li>)}</ol>}
    <div><button className="secondary-button" disabled={!entries.length} onClick={onCreateChannel}>Create channel</button> <button className="secondary-button" aria-label={`Delete ${playlist.name}`} onClick={onDelete}>Delete playlist</button></div>
    <details><summary>Rename playlist</summary><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onRename(name.trim()) }}><input aria-label={`Rename ${playlist.name}`} value={name} onChange={(event) => setName(event.target.value)} /><button className="secondary-button">Save name</button></form></details>
    <details><summary>Edit titles</summary>{media.map((item) => <label className="checkbox-row" key={item.id}><input type="checkbox" checked={playlist.mediaIds.includes(item.id)} onChange={(event) => onChange(item.id, event.target.checked)} /> {item.title}</label>)}</details></div></article>
}

function ChannelCard({ channel, media, playlists, clock, onPlay }: { channel: Channel; media: MediaItem[]; playlists: Playlist[]; clock: Date; onPlay: () => void }) {
  const schedule = makeSchedule(channel, media, clock, playlists)
  const live = nowPlaying(schedule, clock)
  const liveItem = live ? media.find((item) => item.id === live.mediaId) : undefined
  return <article className="channel-card" style={{ '--accent': channel.accent } as CSSProperties}>
    <div className="channel-signal"><span /> LIVE</div>
    <h2>{channel.name}</h2><p>{channel.description}</p>
    {live && liveItem ? <div className="live-program"><span>Now</span><strong>{liveItem.title}</strong><small>{formatClock(live.startsAt)} – {formatClock(live.endsAt)}</small></div> : <div className="live-program muted">No matching titles yet</div>}
    <button className="primary-button" onClick={onPlay}>{live ? 'Join live' : 'Set up library'}</button>
  </article>
}
