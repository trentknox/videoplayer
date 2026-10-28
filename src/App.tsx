import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import PlayerSurface from './PlayerSurface'
import { exportLibrary, importLibrary, loadLibrary, saveLibrary } from './library'
import { analyzePublicPage, analyzeUrl, enrichYouTubeItem } from './providers'
import { scanCatalog } from './catalogScan'
import { advanceCatalogJob } from './catalogJob'
import { movePlaylistItem } from './playlist'
import { dueSource } from './sources'
import { defaultFilters, filterLibrary, mediaType, mediaYear } from './filters'
import { formatStat } from './stats'
import { adjacentChannel } from './channelNavigation'
import { startUpdateMonitor } from './updateMonitor'
import { posterSources } from './posters'
import { readPlayback, saveSelection, saveProgress } from './playbackSession'
import { listBotTokens, createBotToken, revokeBotToken } from './botTokens'
import type { BotScope, BotTokenInfo } from './botTokens'
import { applyShared, getRemoteLibrary, mergeShared, putRemoteLibrary, sharedLibrary } from './cloudSync'
import type { SharedLibrary } from './cloudSync'
import { aiLogin, aiLogout, searchWithAi, searchByKeywords, titleSuggestions, collectionSuggestions } from './aiSearch'
import { discoverForSearch } from './searchSources'
import { searchPublicSources } from './publicSearch'
import type { AiSession, AiSearchResult } from './aiSearch'
import type { LibraryFilters } from './filters'
import { formatClock, makeSchedule, nowPlaying } from './scheduler'
import type { AnalysisResult, Channel, ImportDraft, LibraryState, MediaItem, Playlist } from './types'

type View = 'home' | 'player' | 'library' | 'playlists' | 'channels' | 'history' | 'settings'

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
    ratingCount: analysis.ratingCount,
    imdbRating: analysis.imdbRating,
    metacriticScore: analysis.metacriticScore,
    budgetUsd: analysis.budgetUsd,
    revenueUsd: analysis.revenueUsd,
    poster: analysis.poster,
    durationSeconds: draft.durationMinutes ? Number(draft.durationMinutes) * 60 : analysis.durationSeconds ?? 900,
    durationEstimated: !draft.durationMinutes && (analysis.durationEstimated === true || !analysis.durationSeconds),
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
  const [resumeTarget, setResumeTarget] = useState<{ id: string; position: number }>()
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [resolveAttempt, setResolveAttempt] = useState(0)
  const [activePlaylistId, setActivePlaylistId] = useState<string>()
  const [activeChannelId, setActiveChannelId] = useState<string>()
  const [channelSlotId, setChannelSlotId] = useState<string>()
  const [channelSlotStart, setChannelSlotStart] = useState<string>()
  const [view, setView] = useState<View>('home')
  const [minimizedPlayer, setMinimizedPlayer] = useState(false)
  const [playerEngaged, setPlayerEngaged] = useState(false)
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false)
  const [theaterMode, setTheaterMode] = useState(false)
  const [draft, setDraft] = useState<ImportDraft>(blankDraft)
  const [pageAnalysis, setPageAnalysis] = useState(true)
  const [importing, setImporting] = useState(false)
  const [scanningCatalog, setScanningCatalog] = useState(false)
  const [catalogSections, setCatalogSections] = useState<Array<{ url: string; title: string }>>([])
  const [notice, setNotice] = useState('')
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [search, setSearch] = useState('')
  const [homeSearch, setHomeSearch] = useState('')
  const [aiSession, setAiSession] = useState<AiSession>()
  const [syncStatus, setSyncStatus] = useState('Not connected')
  const [gatewayAddress, setGatewayAddress] = useState('http://127.0.0.1:3021')
  const [gatewayUser, setGatewayUser] = useState('')
  const [gatewayPassword, setGatewayPassword] = useState('')
  const [botName, setBotName] = useState('')
  const [botScopes, setBotScopes] = useState<BotScope[]>(['library:read'])
  const [botTokens, setBotTokens] = useState<BotTokenInfo[]>([])
  const [newBotToken, setNewBotToken] = useState('')
  const [botError, setBotError] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiResult, setAiResult] = useState<AiSearchResult>()
  const [excludedAiIds, setExcludedAiIds] = useState<Set<string>>(new Set())
  const [aiSort, setAiSort] = useState<'relevance' | LibraryFilters['sort']>('relevance')
  const [aiType, setAiType] = useState('')
  const [aiGenre, setAiGenre] = useState('')
  const [aiDialogOpen, setAiDialogOpen] = useState(false)
  const lastNavRef = useRef<HTMLButtonElement | null>(null)
  const [aiFeedback, setAiFeedback] = useState('')
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
  const libraryRef = useRef(library)
  libraryRef.current = library
  const syncRef = useRef<{ session: AiSession; base: SharedLibrary | null; busy: boolean; halted: boolean } | undefined>(undefined)
  const livePositionRef = useRef<{ id: string; position: number } | undefined>(undefined)
  const heldLiveSlot = useRef<{ channelId: string; mediaId: string; slotId: string; startsAt: string } | undefined>(undefined)
  const metadataJobsRef = useRef<{ search?: AbortController; channel?: AbortController }>({})
  const refreshedChannelQueue = useRef('')
  const lastPosterRepair = useRef(0)
  importingRef.current = importing

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('vivid-ai-session') || window.sessionStorage.getItem('vivid-ai-session') || 'null') as AiSession | null
      if (saved && typeof saved.endpoint === 'string' && typeof saved.token === 'string' && saved.token) {
        try { if (!window.localStorage.getItem('vivid-ai-session')) window.localStorage.setItem('vivid-ai-session', JSON.stringify(saved)) } catch { /* This tab can still use its session. */ }
        setAiSession(saved)
        setGatewayAddress(saved.endpoint)
        void refreshBotTokens(saved)
      }
    } catch { /* A new sign-in is required if the session cannot be restored. */ }
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'vivid-ai-session') return
      if (!event.newValue) { setAiSession(undefined); setBotTokens([]); setNewBotToken(''); return }
      try {
        const saved = JSON.parse(event.newValue) as AiSession
        if (typeof saved.endpoint === 'string' && typeof saved.token === 'string' && saved.token) { setAiSession(saved); setGatewayAddress(saved.endpoint); void refreshBotTokens(saved) }
      } catch { /* Ignore malformed storage events. */ }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => startUpdateMonitor(() => setUpdateAvailable(true), () => importingRef.current), [])

  useEffect(() => {
    loadLibrary().then((loaded) => {
      const previous = readPlayback(window.sessionStorage)
      const item = loaded.media.find((entry) => entry.id === previous?.mediaId)
      setLibrary(loaded)
      setActiveId(item?.id ?? loaded.media[0]?.id)
      if (item && previous) {
        setResumeTarget({ id: item.id, position: previous.position })
        setPlayerEngaged(true)
        if (previous.channelId && loaded.channels.some((entry) => entry.id === previous.channelId)) setActiveChannelId(previous.channelId)
        else if (previous.playlistId && loaded.playlists.some((entry) => entry.id === previous.playlistId && entry.mediaIds.includes(item.id))) setActivePlaylistId(previous.playlistId)
      }
    })
  }, [])

  useEffect(() => {
    if (!library || !activeId || !playerEngaged) return
    saveSelection(window.sessionStorage, { mediaId: activeId, playlistId: activePlaylistId, channelId: activeChannelId })
    setResumeTarget((current) => current && current.id !== activeId ? undefined : current)
  }, [library, activeId, activePlaylistId, activeChannelId, playerEngaged])

  useEffect(() => {
    if (!aiSession || !library) { if (!aiSession) { syncRef.current = undefined; setSyncStatus('Not connected') }; return }
    if (!syncRef.current || syncRef.current.session.token !== aiSession.token || syncRef.current.session.endpoint !== aiSession.endpoint) {
      syncRef.current = { session: aiSession, base: null, busy: false, halted: false }
    }
    const timer = window.setTimeout(() => { void synchronizeLibrary() }, 800)
    return () => window.clearTimeout(timer)
  }, [aiSession, library])

  useEffect(() => {
    if (!aiSession) return
    const timer = window.setInterval(() => { void synchronizeLibrary() }, 30000)
    return () => window.clearInterval(timer)
  }, [aiSession])

  useEffect(() => {
    if (library) void saveLibrary(library).catch(() => setNotice('Could not save your library on this device. Export a backup from Settings.'))
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
  // Resolve catalog pages on every selection path, including queue and channel transitions.
  useEffect(() => {
    if (!active) return
    let needsRefresh = active.kind === 'catalog'
    try { needsRefresh ||= new URL(active.sourceUrl).hostname.toLowerCase() === '1movies.stream' } catch { /* Invalid saved URLs stay as links. */ }
    if (!needsRefresh) return
    let cancelled = false
    const id = active.id
    setNotice('Checking for an available player…')
    void analyzePublicPage(active.sourceUrl).then((result) => {
      if (cancelled) return
      if (result.analysisUnavailable) { setNotice('Could not refresh metadata for this title.'); return }
      updateLibrary((current) => ({ ...current, media: current.media.map((entry) => entry.id === id
        ? { ...entry, ...(result.kind === 'video' ? { provider: result.provider, kind: result.kind, embedUrl: result.embedUrl, playerOptions: result.playerOptions } : {}), description: entry.description || result.description, poster: entry.poster || result.poster, contentType: result.contentType ?? entry.contentType, contentRating: result.contentRating ?? entry.contentRating, genres: result.genres?.length ? result.genres : entry.genres, countries: result.countries?.length ? result.countries : entry.countries, year: result.year ?? entry.year, durationSeconds: result.durationSeconds && (entry.durationEstimated ?? (entry.durationSeconds === 900 || entry.durationSeconds === 1800)) ? result.durationSeconds : entry.durationSeconds, durationEstimated: result.durationSeconds && (entry.durationEstimated ?? (entry.durationSeconds === 900 || entry.durationSeconds === 1800)) ? false : entry.durationEstimated, rating: result.rating ?? entry.rating, ratingCount: result.ratingCount ?? entry.ratingCount, imdbRating: result.imdbRating ?? entry.imdbRating, metacriticScore: result.metacriticScore ?? entry.metacriticScore, budgetUsd: result.budgetUsd ?? entry.budgetUsd, revenueUsd: result.revenueUsd ?? entry.revenueUsd, actors: [...new Set([...entry.actors, ...(result.actors ?? [])])] } : entry) }))
      setNotice(result.kind === 'video' ? 'Player and metadata refreshed. Playback depends on the provider.' : 'Metadata refreshed; no playable embed was found.')
    }).catch(() => { if (!cancelled) setNotice('Could not refresh this player.') })
    return () => { cancelled = true }
  }, [activeId, activePlaylistId, activeChannelId, resolveAttempt])
  useEffect(() => { setSelectedPlayer(''); livePositionRef.current = undefined }, [activeId, channelSlotId])
  useEffect(() => {
    if (!library || importing || sourceSyncLock.current) return
    const source = dueSource(library, clock.getTime())
    if (!source) return
    sourceSyncLock.current = true
    updateLibrary((current) => ({ ...current, sources: current.sources?.map((entry) => entry.id === source.id ? { ...entry, lastChecked: new Date().toISOString() } : entry) }))
    void importPageListings({ sourceUrl: source.url, background: true }).finally(() => { sourceSyncLock.current = false })
  }, [library, importing, clock])
  useEffect(() => {
    if (!library || importing || sourceSyncLock.current || Date.now() - lastPosterRepair.current < 30_000) return
    const hasMissing = library.media.some((item) => (!item.poster || /\/images\/backdrops\//i.test(item.poster)) && (item.provider === 'embed' || item.kind === 'catalog'))
    if (!hasMissing) return
    lastPosterRepair.current = Date.now()
    void repairPosters()
  }, [library, importing, clock])
  const activePlaylist = library?.playlists.find((playlist) => playlist.id === activePlaylistId)
  const mediaById = useMemo(() => new Map((library?.media ?? []).map((item) => [item.id, item])), [library?.media])
  const aiMatches = useMemo(() => (aiResult?.ids ?? []).map((id) => mediaById.get(id)).filter((item): item is MediaItem => Boolean(item)), [aiResult, mediaById])
  const aiGenres = useMemo(() => [...new Set(aiMatches.flatMap((item) => item.genres ?? []))].sort(), [aiMatches])
  const filteredAiMatches = useMemo(() => {
    const filtered = aiMatches.filter((item) => (!aiType || mediaType(item) === aiType) && (!aiGenre || (item.genres ?? []).includes(aiGenre)))
    return aiSort === 'relevance' ? filtered : filterLibrary(filtered, { ...defaultFilters, sort: aiSort, order: aiSort === 'title' ? 'asc' : 'desc' })
  }, [aiMatches, aiType, aiGenre, aiSort])
  const filteredAiIds = useMemo(() => new Set(filteredAiMatches.map((item) => item.id)), [filteredAiMatches])
  const visibleMedia = useMemo(() => {
    if (!library) return []
    return filterLibrary(library.media, { ...filters, query: search })
  }, [library, search, filters])
  const topRated = useMemo(() => library ? filterLibrary(library.media.filter((item) => item.rating !== undefined), { ...defaultFilters, sort: 'rating', order: 'desc' }).slice(0, 24) : [], [library])
  const latestMovies = useMemo(() => library ? filterLibrary(library.media.filter((item) => mediaType(item) === 'movie'), { ...defaultFilters, sort: 'year', order: 'desc' }).slice(0, 24) : [], [library])
  const latestShows = useMemo(() => library ? filterLibrary(library.media.filter((item) => mediaType(item) === 'series'), { ...defaultFilters, sort: 'year', order: 'desc' }).slice(0, 24) : [], [library])

  const allSchedules = useMemo(() => {
    if (!library) return new Map<string, ReturnType<typeof makeSchedule>>()
    return new Map(library.channels.map((channel) => [channel.id, makeSchedule(channel, library.media, clock, library.playlists)]))
  }, [library, clock])

  useEffect(() => {
    if (!activeChannelId || !library) { heldLiveSlot.current = undefined; return }
    const channel = library.channels.find((entry) => entry.id === activeChannelId)
    if (!channel) { heldLiveSlot.current = undefined; return }
    let timer: number | undefined
    const update = () => {
      const held = heldLiveSlot.current
      const heldItem = held?.channelId === channel.id ? library.media.find((item) => item.id === held.mediaId) : undefined
      if (held && heldItem && (heldItem.durationEstimated ?? (heldItem.durationSeconds === 900 || heldItem.durationSeconds === 1800))) {
        setActiveId(held.mediaId); setChannelSlotId(held.slotId); setChannelSlotStart(held.startsAt)
        return
      }
      heldLiveSlot.current = undefined
      const now = new Date()
      const slot = nowPlaying(makeSchedule(channel, library.media, now, library.playlists), now)
      if (!slot) return
      setActiveId(slot.mediaId)
      setChannelSlotId(slot.id)
      setChannelSlotStart(slot.startsAt)
      const item = library.media.find((entry) => entry.id === slot.mediaId)
      if (item && (item.durationEstimated ?? (item.durationSeconds === 900 || item.durationSeconds === 1800))) {
        heldLiveSlot.current = { channelId: channel.id, mediaId: slot.mediaId, slotId: slot.id, startsAt: slot.startsAt }
      } else timer = window.setTimeout(update, Math.max(100, new Date(slot.endsAt).getTime() - now.getTime() + 50))
    }
    update()
    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [activeChannelId, library])

  useEffect(() => {
    if (!activeChannelId || !library) { refreshedChannelQueue.current = ''; return }
    const channel = library.channels.find((item) => item.id === activeChannelId)
    const ids = channel?.playlistId ? library.playlists.find((item) => item.id === channel.playlistId)?.mediaIds : channel?.mediaIds
    if (!ids?.length) return
    const key = `${activeChannelId}:${ids.join(',')}`
    if (refreshedChannelQueue.current === key) return
    refreshedChannelQueue.current = key
    void refreshQueueDurations(ids, library)
  }, [activeChannelId, library])

  useEffect(() => {
    if (!activeChannelId || !library || view !== 'player') return
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

  async function synchronizeLibrary(): Promise<void> {
    const sync = syncRef.current
    const local = libraryRef.current
    if (!sync || !local || sync.busy || sync.halted) return
    sync.busy = true
    setSyncStatus('Syncing…')
    const snapshot = sharedLibrary(local)
    try {
      const remote = await getRemoteLibrary(sync.session)
      if (syncRef.current !== sync) return
      const merged = mergeShared(sync.base, snapshot, remote.state)
      if (!remote.state || JSON.stringify(merged) !== JSON.stringify(remote.state)) await putRemoteLibrary(sync.session, remote.revision, merged)
      if (syncRef.current !== sync) return
      sync.base = structuredClone(merged)
      setLibrary((current) => {
        if (!current || syncRef.current !== sync) return current
        try {
          const reconciled = mergeShared(snapshot, sharedLibrary(current), merged)
          return JSON.stringify(sharedLibrary(current)) === JSON.stringify(reconciled) ? current : applyShared(current, reconciled)
        } catch (error) {
          sync.halted = true
          queueMicrotask(() => setSyncStatus(error instanceof Error ? error.message : 'Sync conflict. Neither copy was overwritten.'))
          return current
        }
      })
      if (!sync.halted) setSyncStatus('Private library synced')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Private library sync failed.'
      if (!message.includes('server changed during sync')) sync.halted = true
      setSyncStatus(message)
    } finally { sync.busy = false }
  }

  function updateDraft<K extends keyof ImportDraft>(key: K, value: ImportDraft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function recordPlayback(): void {
    if (!activeId) return
    setPlayerEngaged(true)
    const now = Date.now()
    updateLibrary((current) => {
      const previous = current.history ?? []
      if (previous[0]?.mediaId === activeId && now - Date.parse(previous[0].playedAt) < 60_000) return current
      return { ...current, history: [{ mediaId: activeId, playedAt: new Date(now).toISOString() }, ...previous].slice(0, 100) }
    })
  }

  function recordProgress(position: number): void {
    if (!activeId || !Number.isFinite(position) || position < 0) return
    saveProgress(window.sessionStorage, activeId, position)
    const previous = livePositionRef.current
    livePositionRef.current = { id: activeId, position }
    if (!activeChannelId || !library || !previous || previous.id !== activeId || position >= previous.position - 3) return
    const channel = library.channels.find((entry) => entry.id === activeChannelId)
    if (!channel) return
    let playlistId = channel.playlistId && library.playlists.some((entry) => entry.id === channel.playlistId) ? channel.playlistId : undefined
    if (!playlistId) {
      const ids = [...new Set((allSchedules.get(channel.id) ?? []).map((slot) => slot.mediaId))]
      if (!ids.length) return
      const playlist: Playlist = { id: makeId('playlist'), name: `${channel.name} replay`, mediaIds: ids, createdAt: new Date().toISOString() }
      playlistId = playlist.id
      updateLibrary((current) => ({ ...current, playlists: [playlist, ...current.playlists] }))
    }
    setResumeTarget({ id: activeId, position })
    setActivePlaylistId(playlistId)
    setActiveChannelId(undefined)
    setShouldAutoPlay(true)
    setView('playlists')
    setNotice('Rewound into the playlist. Open Channels to return to the live schedule.')
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
              return toMediaItem({ ...result, title: result.title === new URL(listing.url).hostname ? listing.title : result.title, poster: listing.poster ?? result.poster, year: result.year ?? listing.year }, { ...blankDraft, tags: importDraft.tags, series: importDraft.series || job.seriesNames?.[start!] || '', season: listing.season?.toString() ?? importDraft.season, episode: listing.episode?.toString() ?? importDraft.episode }, true)
            } catch {
              return toMediaItem({ ...analyzeUrl(listing.url), durationSeconds: undefined, durationEstimated: true, title: listing.title, poster: listing.poster, year: listing.year, actors: listing.actors }, { ...blankDraft, tags: importDraft.tags, series: importDraft.series || job.seriesNames?.[start!] || '', season: listing.season?.toString() ?? importDraft.season, episode: listing.episode?.toString() ?? importDraft.episode }, true)
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

  async function connectAi(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setAiBusy(true)
    try {
      const session = await aiLogin(gatewayAddress, gatewayUser, gatewayPassword)
      setAiSession(session)
      try { window.localStorage.setItem('vivid-ai-session', JSON.stringify(session)); window.sessionStorage.removeItem('vivid-ai-session') } catch { try { window.sessionStorage.setItem('vivid-ai-session', JSON.stringify(session)) } catch { /* Continue without persistence. */ } }
      setGatewayPassword('')
      void refreshBotTokens(session)
      setNotice('AI gateway connected for this session.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not connect to the AI gateway.') }
    finally { setAiBusy(false) }
  }

  async function refreshBotTokens(session: AiSession): Promise<void> {
    try { setBotTokens(await listBotTokens(session)); setBotError('') }
    catch (error) { setBotError(error instanceof Error ? error.message : 'Could not load bot tokens.') }
  }

  async function generateBotToken(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!aiSession || !botName.trim() || !botScopes.length) return
    setBotError('')
    try {
      const created = await createBotToken(aiSession, botName.trim(), botScopes, 30)
      setNewBotToken(created.token)
      setBotName('')
      await refreshBotTokens(aiSession)
    } catch (error) { setBotError(error instanceof Error ? error.message : 'Could not create a bot token.') }
  }

  async function askAi(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!library || !homeSearch.trim()) return
    setAiDialogOpen(true)
    setExcludedAiIds(new Set())
    setAiSort('relevance'); setAiType(''); setAiGenre('')
    setAiResult(undefined)
    setAiResult(searchByKeywords(homeSearch, library.media))
    setAiFeedback('Showing library keyword matches while source and AI search continue…')
    setAiBusy(true)
    try {
      let media = library.media
      let sourceStatus = ''
      const directSourceUrls = new Set<string>()
      const searchSources = [...(library.sources ?? [])]
      const sourceOrigins = new Set(searchSources.flatMap((entry) => { try { return [new URL(entry.url).origin] } catch { return [] } }))
      for (const item of media) {
        if (sourceOrigins.size >= 3) break
        if (item.provider !== 'embed' && item.kind !== 'catalog') continue
        try {
          const url = new URL(item.sourceUrl)
          if (!['http:', 'https:'].includes(url.protocol) || sourceOrigins.has(url.origin)) continue
          sourceOrigins.add(url.origin)
          searchSources.push({ id: `inferred-${url.origin}`, url: `${url.origin}/` })
        } catch { /* Ignore invalid stored URLs. */ }
      }
      if (searchSources.length > 0) {
        setAiFeedback('Searching your sources directly…')
        const deadline = AbortSignal.timeout(15000)
        const boundedAnalyze = (url: string) => analyzePublicPage(url, deadline)
        const direct = await searchPublicSources(searchSources, homeSearch, boundedAnalyze)
        for (const listing of direct.listings) directSourceUrls.add(listing.url)
        const known = new Set(media.map((item) => item.sourceUrl))
        const entries = direct.listings.filter((listing) => !known.has(listing.url)).map((listing) => toMediaItem({ ...analyzeUrl(listing.url), durationSeconds: undefined, durationEstimated: true, title: listing.title, poster: listing.poster, year: listing.year, actors: listing.actors }, { ...blankDraft, url: listing.url, season: listing.season?.toString() ?? '', episode: listing.episode?.toString() ?? '' }, true))
        const actorByUrl = new Map(direct.listings.filter((item) => item.actors?.length).map((item) => [item.url, item.actors!]))
        const addActors = (item: MediaItem): MediaItem => {
          const names = actorByUrl.get(item.sourceUrl)
          if (!names?.some((name) => !item.actors.includes(name))) return item
          return { ...item, actors: [...new Set([...item.actors, ...names])] }
        }
        if (entries.length || actorByUrl.size) {
          media = [...entries, ...media.map(addActors)]
          updateLibrary((current) => {
            const existing = new Set(current.media.map((item) => item.sourceUrl))
            return { ...current, media: [...entries.filter((item) => !existing.has(item.sourceUrl)), ...current.media.map(addActors)] }
          })
        }
        if (direct.listings.length) {
          const foundUrls = new Set(direct.listings.map((item) => item.url))
          void refreshQueueDurations(media.filter((item) => foundUrls.has(item.sourceUrl)).map((item) => item.id), { ...library, media }, 'search')
        }
        if (direct.searched) {
          sourceStatus = ` Searched ${direct.searched} source${direct.searched === 1 ? '' : 's'} directly and found ${direct.listings.length} listed titles.${direct.incomplete ? ' Some source results may be incomplete.' : ''}`
        } else if (deadline.aborted) sourceStatus = ' Source search timed out; library matches are still available.'
        else if (sourceSyncLock.current || importingRef.current) sourceStatus = ' No public source search form was available; a background scan is still running.'
        else {
          sourceSyncLock.current = true
          setImporting(true)
          importingRef.current = true
          try {
            setAiFeedback('Checking saved catalogs for more titles…')
            const discovered = await discoverForSearch(searchSources, media.map((item) => item.sourceUrl), library.catalogJobs ?? {}, boundedAnalyze)
            const found = discovered.listings.map((listing) => toMediaItem({ ...analyzeUrl(listing.url), title: listing.title, poster: listing.poster, year: listing.year }, { ...blankDraft, url: listing.url, season: listing.season?.toString() ?? '', episode: listing.episode?.toString() ?? '' }, true))
            media = [...found, ...media]
            updateLibrary((current) => {
              const existing = new Set(current.media.map((item) => item.sourceUrl))
              const jobs = { ...current.catalogJobs }
              for (const source of searchSources.slice(0, 3)) {
                if (!source.id.startsWith('inferred-') && !current.sources?.some((entry) => entry.url === source.url)) continue
                if (discovered.jobs[source.url]) jobs[source.url] = discovered.jobs[source.url]
                else delete jobs[source.url]
              }
              return { ...current, media: [...found.filter((item) => !existing.has(item.sourceUrl)), ...current.media], catalogJobs: jobs }
            })
            sourceStatus = ` No public source search form was available; scanned catalogs and found ${found.length} new titles.${discovered.incomplete ? ' Some sources are incomplete or unavailable.' : ''}`
          } finally { sourceSyncLock.current = false; importingRef.current = false; setImporting(false) }
        }
      } else sourceStatus = ' No sources are saved yet; add one in Library to search beyond this collection.'
      setAiResult(searchByKeywords(homeSearch, media))
      setAiFeedback('Showing source and library keyword matches while AI ranks results…' + sourceStatus)
      let result: AiSearchResult
      let keywordFallback = !aiSession
      let aiFailure = ''
      if (aiSession) {
        try { result = await searchWithAi(aiSession, homeSearch, media) }
        catch (error) { keywordFallback = true; aiFailure = error instanceof Error ? error.message : 'The AI request failed.'; result = searchByKeywords(homeSearch, media) }
      } else result = searchByKeywords(homeSearch, media)
      if (!keywordFallback) {
        const exact = searchByKeywords(homeSearch, media)
        const directIds = new Set(media.filter((item) => directSourceUrls.has(item.sourceUrl)).map((item) => item.id))
        const ids = [...new Set([...result.ids, ...exact.ids.filter((id) => directIds.has(id))])]
        const suggestions = [...collectionSuggestions(homeSearch, media, ids), ...result.suggestions]
        for (const group of titleSuggestions(media, ids)) if (!suggestions.some((item) => item.name.toLocaleLowerCase() === group.name.toLocaleLowerCase()) && suggestions.length < 8) suggestions.push(group)
        result = { ...result, ids, suggestions }
      }
      setAiResult(result)
      const modelNote = aiSession && !keywordFallback && result.servedModel
        ? ` Served by ${result.servedModel}.`
        : keywordFallback
        ? ' AI unavailable; these are keyword matches.'
        : ''
      setAiFeedback((result.ids.length ? `Found ${result.ids.length} titles. Review the preview below.` : 'No matching titles were found in the items examined.') + sourceStatus + aiFailure + modelNote)
    } catch (error) { setAiFeedback(error instanceof Error ? error.message : 'AI search failed.') }
    finally { setAiBusy(false) }
  }

  function playCollection(name: string, media: MediaItem[]): void {
    if (!media.length) return
    const playlist: Playlist = { id: makeId('playlist'), name, mediaIds: media.map((item) => item.id), createdAt: new Date().toISOString() }
    updateLibrary((current) => ({ ...current, playlists: [playlist, ...current.playlists] }))
    setActiveChannelId(undefined)
    setActivePlaylistId(playlist.id)
    setActiveId(media[0].id)
    setPlayerEngaged(true)
    setShouldAutoPlay(true)
    setMinimizedPlayer(false)
    setView('player')
  }

  async function refreshQueueDurations(ids: string[], current: LibraryState, kind: 'search' | 'channel' = 'channel'): Promise<void> {
    const byId = new Map(current.media.map((item) => [item.id, item]))
    const candidates = ids.map((id) => byId.get(id)).filter((item): item is MediaItem => Boolean(item && item.provider === 'embed' && ((item.durationEstimated ?? (item.durationSeconds === 900 || item.durationSeconds === 1800)) || !item.description || !item.actors.length || !item.genres?.length))).slice(0, 200)
    metadataJobsRef.current[kind]?.abort()
    const controller = new AbortController()
    metadataJobsRef.current[kind] = controller
    const deadline = AbortSignal.any([controller.signal, AbortSignal.timeout(120000)])
    let results: Array<{ id: string; result: AnalysisResult }> = []
    for (let offset = 0; offset < candidates.length && !deadline.aborted; offset += 4) {
      const batch = await Promise.all(candidates.slice(offset, offset + 4).map(async (item) => ({ id: item.id, result: await analyzePublicPage(item.sourceUrl, deadline) })))
      results.push(...batch.filter(({ result }) => !result.analysisUnavailable))
      if ((offset + 4) % 12 !== 0 && offset + 4 < candidates.length && !deadline.aborted) continue
      if (!results.length) continue
      const updates = new Map(results.map(({ id, result }) => [id, result]))
      results = []
      updateLibrary((state) => ({ ...state, media: state.media.map((item) => {
        const result = updates.get(item.id)
        if (!result) return item
        const useDuration = Boolean(result.durationSeconds && (item.durationEstimated ?? (item.durationSeconds === 900 || item.durationSeconds === 1800)))
        return { ...item, description: item.description || result.description, poster: item.poster || result.poster, contentType: item.contentType || result.contentType, genres: item.genres?.length ? item.genres : result.genres, countries: item.countries?.length ? item.countries : result.countries, year: item.year ?? result.year, rating: item.rating ?? result.rating, ratingCount: item.ratingCount ?? result.ratingCount, imdbRating: item.imdbRating ?? result.imdbRating, metacriticScore: item.metacriticScore ?? result.metacriticScore, actors: [...new Set([...item.actors, ...(result.actors ?? [])])], durationSeconds: useDuration ? result.durationSeconds! : item.durationSeconds, durationEstimated: useDuration ? false : item.durationEstimated }
      }) }))
    }
  }

  function saveAiPreview(startChannel: boolean, suggestion?: { name: string; ids: string[] }): void {
    if (!library || !aiResult?.ids.length) return
    const available = new Set(library.media.map((item) => item.id))
    const mediaIds = (suggestion?.ids ?? filteredAiMatches.map((item) => item.id)).filter((id) => available.has(id) && filteredAiIds.has(id) && !excludedAiIds.has(id))
    if (!mediaIds.length) { setAiFeedback('No titles are selected. Include at least one title before creating a playlist.'); return }
    const playlist: Playlist = { id: makeId('playlist'), name: suggestion?.name ?? aiResult.name, mediaIds, createdAt: new Date().toISOString() }
    const channel: Channel | undefined = startChannel ? { id: makeId('channel'), name: playlist.name, description: `Loops the ${playlist.name} playlist in order.`, filter: '', accent: accents[library.channels.length % accents.length], anchor: new Date().toISOString(), durationHours: 24, playlistId: playlist.id } : undefined
    updateLibrary((current) => ({ ...current, playlists: [playlist, ...current.playlists], channels: channel ? [channel, ...current.channels] : current.channels }))
    setAiDialogOpen(false)
    if (channel) {
      setClock(new Date())
      setActivePlaylistId(undefined)
      setActiveId(mediaIds[0])
      setActiveChannelId(channel.id)
      setPlayerEngaged(true)
      setShouldAutoPlay(true)
      setMinimizedPlayer(false)
      setView('player')
      window.requestAnimationFrame(() => playerPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      setNotice(`Created ${playlist.name} and opened its channel. Some providers require you to press play.`)
    } else { setView('playlists'); setNotice(`Saved playlist ${playlist.name}.`) }
  }

  async function repairPosters(manual = false): Promise<void> {
    if (!library || sourceSyncLock.current || importingRef.current) return
    const urls = new Set<string>()
    for (const item of library.media) {
      if (item.poster && !/\/images\/backdrops\//i.test(item.poster)) continue
      if (item.provider !== 'embed' && item.kind !== 'catalog') continue
      try {
        const source = new URL(item.sourceUrl)
        if (!['http:', 'https:'].includes(source.protocol)) continue
        const saved = library.sources?.find((entry) => { try { return new URL(entry.url).origin === source.origin } catch { return false } })
        urls.add(saved?.url ?? `${source.origin}/`)
      } catch { /* Ignore invalid saved links. */ }
    }
    const sources = [...urls].filter((url) => manual || !library.posterRepairDone?.includes(url)).slice(0, 3)
    if (!sources.length) { if (manual) setNotice('No missing catalog posters were found to repair.'); return }
    sourceSyncLock.current = true
    importingRef.current = true
    setImporting(true)
    let repaired = 0
    let failed = 0
    let incomplete = false
    try {
      for (const url of sources) {
        const seen = manual && library.posterRepairDone?.includes(url) ? [] : library.posterRepairSeen?.[url] ?? []
        const jobs = manual && library.posterRepairDone?.includes(url) ? {} : library.posterRepairJobs ?? {}
        const found = await discoverForSearch([{ id: url, url }], seen, jobs, analyzePublicPage)
        const posters = new Map(found.listings.filter((entry) => entry.poster).map((entry) => [entry.url, entry.poster!]))
        failed += found.failed
        repaired += library.media.filter((item) => posters.has(item.sourceUrl) && (!item.poster || /\/images\/backdrops\//i.test(item.poster))).length
        incomplete ||= found.incomplete
        updateLibrary((current) => {
          const nextJobs = { ...current.posterRepairJobs }
          if (found.jobs[url]) nextJobs[url] = found.jobs[url]
          else delete nextJobs[url]
          const done = new Set(current.posterRepairDone ?? [])
          if (!found.incomplete || found.failed) done.add(url)
          else done.delete(url)
          return { ...current, media: current.media.map((item) => {
            const poster = posters.get(item.sourceUrl)
            return poster && (!item.poster || /\/images\/backdrops\//i.test(item.poster)) ? { ...item, poster, contentType: item.contentType ?? (/\/watch-movie\//i.test(item.sourceUrl) ? 'movie' : undefined) } : item
          }), posterRepairJobs: nextJobs, posterRepairSeen: { ...current.posterRepairSeen, [url]: [...new Set([...seen, ...found.listings.map((entry) => entry.url)])] }, posterRepairDone: [...done] }
        })
      }
      if (manual) setNotice(`Updated ${repaired} posters.${failed ? ` Could not read ${failed} source${failed === 1 ? '' : 's'}; try again later.` : incomplete ? ' The catalog scan will continue while Vivid is open.' : ''}`)
    } finally { sourceSyncLock.current = false; importingRef.current = false; setImporting(false) }
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
    setResolveAttempt((attempt) => attempt + 1)
    setActiveChannelId(undefined)
    setActivePlaylistId(undefined)
    setActiveId(id)
    setPlayerEngaged(true)
    setShouldAutoPlay(true)
    setMinimizedPlayer(false)
    setView('player')
    window.requestAnimationFrame(() => playerPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

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
    const first = playlist.mediaIds.find((id) => library.media.some((item) => item.id === id))
    if (first) {
      setActiveId(first); setActivePlaylistId(undefined); setActiveChannelId(channel.id)
      setPlayerEngaged(true); setShouldAutoPlay(true); setMinimizedPlayer(false); setView('player')
    }
    setNotice(`${playlist.name} channel created. Its queue follows the playlist order.`)
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
    const slot = library ? nowPlaying(makeSchedule(channel, library.media, new Date(), library.playlists)) : undefined
    if (slot) {
      setActiveId(slot.mediaId); setActivePlaylistId(undefined); setActiveChannelId(channel.id)
      setPlayerEngaged(true); setShouldAutoPlay(true); setMinimizedPlayer(false); setView('player')
      setNotice(`${name} channel created and ready to play.`)
    } else setNotice(`${name} channel created. Add titles matching its filter to start it.`)
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
    setPlayerEngaged(true)
    setShouldAutoPlay(true)
    setMinimizedPlayer(false)
    setView('player')
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
        <nav
          aria-label="Main navigation"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && lastNavRef.current) {
              lastNavRef.current.focus();
            }
          }}
        >
          {(['home', 'player', 'library', 'playlists', 'channels', 'history', 'settings'] as View[]).map((name) => (
            <button
              key={name}
              className={view === name ? 'nav-active' : ''}
              onFocus={(event) => {
                const target = event.target as HTMLElement;
                if (target instanceof HTMLButtonElement) lastNavRef.current = target;
              }}
              onClick={() => setView(name)}
            >{name}</button>
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

      <>
        <section className="content-section home-gallery" hidden={view !== 'home'}>
            <form className="home-search" onSubmit={askAi}><input aria-label="Search your library" value={homeSearch} onChange={(event) => setHomeSearch(event.target.value)} placeholder="Ask for a movie, playlist, or channel…" /><button className="home-search-action" disabled={aiBusy}>{aiBusy ? 'Searching…' : 'Ask AI ↗'}</button></form>
          {aiDialogOpen && <div className="ai-dialog-backdrop" onClick={() => setAiDialogOpen(false)}><section className="ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-dialog-title" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') setAiDialogOpen(false) }}>
            <div className="ai-dialog-heading"><div><span className="section-eyebrow">AI SEARCH</span><h2 id="ai-dialog-title">{aiResult?.name ?? 'Your request'}</h2></div><button className="secondary-button" aria-label="Close search results" autoFocus onClick={() => setAiDialogOpen(false)}>×</button></div>
            <p className="ai-dialog-query">{homeSearch}</p><p role="status">{aiFeedback}</p>
            {!aiSession && !aiBusy && <button className="secondary-button" onClick={() => { setAiDialogOpen(false); setView('settings') }}>Connect AI in Settings</button>}
            {aiResult && <section aria-label="AI search results"><div className="search-result-filters"><label>Type<select aria-label="Search result type" value={aiType} onChange={(event) => setAiType(event.target.value)}><option value="">All types</option><option value="movie">Movies</option><option value="series">Series</option><option value="episode">Episodes</option></select></label><label>Genre<select aria-label="Search result genre" value={aiGenre} onChange={(event) => setAiGenre(event.target.value)}><option value="">All genres</option>{aiGenres.map((genre) => <option key={genre}>{genre}</option>)}</select></label><label>Sort<select aria-label="Sort search results" value={aiSort} onChange={(event) => setAiSort(event.target.value as typeof aiSort)}><option value="relevance">Relevance</option><option value="rating">Highest source rating</option><option value="votes">Popularity (source rating count)</option><option value="imdb">Highest IMDb rating</option><option value="metacritic">Highest Metacritic score</option><option value="budget">Highest budget</option><option value="revenue">Highest revenue</option><option value="year">Newest year</option><option value="title">Title A–Z</option></select></label></div><p>Popularity uses the source’s rating count, not view counts. Titles without a value sort last.</p><p>{filteredAiMatches.filter((item) => !excludedAiIds.has(item.id)).length} selected of {filteredAiMatches.length} shown · {aiResult.ids.length} total matches · examined {aiResult.examined} of {aiResult.total} library titles{aiResult.examined < aiResult.total ? ' (results may be incomplete)' : ''}</p>
              <div className="ai-preview-grid">{filteredAiMatches.slice(0, 60).map((item) => { const id = item.id; return item ? <div className="ai-preview-card" key={id}><button className="ai-preview-play" aria-label={item.title} onClick={() => { setAiDialogOpen(false); playFromLibrary(id) }}><PosterImage item={item} /><span>{item.title}</span></button><label className="ai-preview-include"><input type="checkbox" aria-label={`Include ${item.title}`} checked={!excludedAiIds.has(id)} onChange={(event) => setExcludedAiIds((current) => { const next = new Set(current); if (event.target.checked) next.delete(id); else next.add(id); return next })} /> Include</label></div> : null })}</div>{filteredAiMatches.length > 60 && <p>Showing the first 60 results; the playlist can include all filtered matches.</p>}
              {aiResult.suggestions.length > 0 && <section className="ai-suggestions"><h3>Suggested playlists and channels</h3>{aiResult.suggestions.map((suggestion) => <div className="ai-suggestion" key={suggestion.name}><div className="ai-suggestion-heading"><div><strong>{suggestion.name}</strong><p>{suggestion.ids.filter((id) => filteredAiIds.has(id) && !excludedAiIds.has(id)).length} selected · {suggestion.ids.length} titles</p></div><div className="ai-suggestion-actions"><button className="secondary-button" onClick={() => saveAiPreview(false, suggestion)}>Save {suggestion.name} playlist</button><button className="secondary-button" onClick={() => saveAiPreview(true, suggestion)}>Start {suggestion.name} channel</button></div></div><div className="suggestion-carousel" aria-label={`${suggestion.name} titles`}>{suggestion.ids.filter((id) => filteredAiIds.has(id)).slice(0, 100).map((id) => { const item = mediaById.get(id); return item ? <button key={id} className={`suggestion-poster ${excludedAiIds.has(id) ? 'is-excluded' : ''}`} aria-label={`Play ${item.title}`} onClick={() => { setAiDialogOpen(false); playFromLibrary(id) }}><PosterImage item={item} /><span>{item.title}</span></button> : null })}</div>{suggestion.ids.length > 100 && <p>Showing the first 100 posters; the collection includes all selected titles.</p>}</div>)}</section>}
              {aiResult.ids.length > 0 && <div className="ai-preview-actions"><button className="primary-button" onClick={() => saveAiPreview(true)}>Create playlist &amp; start channel</button><button className="secondary-button" onClick={() => saveAiPreview(false)}>Save playlist</button></div>}
            </section>}
          </section></div>}
          <div className="section-heading curated-heading"><h2>Trending</h2>{topRated.length > 0 && <button className="secondary-button" onClick={() => playCollection('Top rated', topRated)}>Play as playlist</button>}</div>
          <p className="gallery-caption">Trending data is not available from your sources yet. Showing top-rated titles from your library.</p>
          {topRated.length ? <MediaGrid media={topRated} activeId={activeId} onPlay={playFromLibrary} onRemove={removeMedia} /> : <p>Add titles with source ratings to see picks here.</p>}
          <div className="section-heading curated-heading"><h2>Latest Movies</h2>{latestMovies.length > 0 && <button className="secondary-button" onClick={() => playCollection('Latest Movies', latestMovies)}>Play as playlist</button>}</div>
          {latestMovies.length ? <MediaGrid media={latestMovies} activeId={activeId} onPlay={playFromLibrary} onRemove={removeMedia} /> : <p>Import movies to see them here.</p>}
          <div className="section-heading curated-heading"><h2>Latest TV Shows</h2>{latestShows.length > 0 && <button className="secondary-button" onClick={() => playCollection('Latest TV Shows', latestShows)}>Play as playlist</button>}</div>
          {latestShows.length ? <MediaGrid media={latestShows} activeId={activeId} onPlay={playFromLibrary} onRemove={removeMedia} /> : <p>Import TV shows to see them here.</p>}
        </section>
        <section className={`hero-grid ${view !== 'player' || minimizedPlayer ? 'mini-player-grid' : theaterMode ? 'theater-mode' : ''}`} hidden={view !== 'player' && (!active || !playerEngaged)}>
          <div className="player-panel" ref={playerPanel}>
            {view !== 'player' || minimizedPlayer ? <button className="mini-player-return" onClick={() => { setMinimizedPlayer(false); setView('player') }}>Return to player ↗</button> : <div className="player-toolbar"><button onClick={() => setTheaterMode((value) => !value)} aria-pressed={theaterMode}>{theaterMode ? 'Exit theater mode' : 'Theater mode'}</button><button onClick={() => setMinimizedPlayer(true)}>Mini-player ↘</button></div>}
            <div className="section-eyebrow">NOW PLAYING</div>
            <PlayerSurface key={activeChannelId ? channelSlotId : activeId} item={activePlayer} resumeAt={!activeChannelId && resumeTarget && resumeTarget.id === activeId ? resumeTarget.position : undefined} onProgress={recordProgress} onAutoPlayNotice={(message) => setNotice(message)} onDuration={(duration) => { const id = activeId; if (id) updateLibrary((current) => ({ ...current, media: current.media.map((entry) => entry.id === id && (entry.durationEstimated ?? entry.durationSeconds === 900) ? { ...entry, durationSeconds: duration, durationEstimated: false } : entry) })) }} onStarted={recordPlayback} onEnded={activePlaylist ? nextInPlaylist : undefined} autoPlay={Boolean(shouldAutoPlay || activePlaylist || activeChannelId || (resumeTarget && resumeTarget.id === activeId && resumeTarget.position > 0))} slotStart={activeChannelId ? channelSlotStart : undefined} />
            <div className="now-playing-meta">
              <div>
                <h1>{active?.title ?? 'Your media, one screen.'}</h1>
                {active && <p>{providerLabel(active.provider)} · {active.kind} · {formatRuntime(active.durationSeconds)}</p>}
                {active && activeChannelId && (active.durationEstimated ?? (active.durationSeconds === 900 || active.durationSeconds === 1800)) && <p>Runtime is unknown. Vivid will not switch videos using this estimate; live timing may be approximate.</p>}
                {active?.description && <p>{active.description}</p>}
                {active && <p>{[active.year && String(active.year), ...(active.genres ?? []), active.imdbRating !== undefined ? `IMDb ${active.imdbRating.toFixed(1)}/10` : active.metacriticScore !== undefined ? `Metacritic ${Math.round(active.metacriticScore)}/100` : active.rating !== undefined ? `Source rating ${active.rating.toFixed(1)}/10` : '', active.actors.length ? `Cast: ${active.actors.slice(0, 8).join(', ')}` : ''].filter(Boolean).join(' · ')}</p>}
                {active && (active.playerOptions?.length ?? 0) > 1 && <label>Player <select value={selectedPlayer || active.embedUrl} onChange={(event) => setSelectedPlayer(event.target.value)}>{active.playerOptions?.map((option) => <option key={option.url} value={option.url}>{option.name}</option>)}</select></label>}
                {active && safeExternalUrl(active.sourceUrl) && <a className="text-button" href={safeExternalUrl(active.sourceUrl)} target="_blank" rel="noopener noreferrer">Open original source ↗</a>}
              </div>
              {active && <div>{activePlaylist && <button className="secondary-button" onClick={nextInPlaylist}>Next in {activePlaylist.name} →</button>} <button className="secondary-button" onClick={() => addToWatchLater(active.id)}>＋ Watch later</button></div>}
            </div>
          </div>

        </section>


      </>

      {view === 'library' && <section className="content-section library-view">
          <details className="import-card">
            <summary>Universal importer</summary>
            <div className="section-eyebrow">UNIVERSAL IMPORTER</div>
            <h2>Paste a source. Build your world.</h2>
            <p>Single videos, playlists, channels, permitted public pages, direct streams, Plex sources, YouTube, Twitch, and Cloudflare Stream.</p>
            <form onSubmit={handleImport} className="import-form">
              <label>Source URL<input required type="url" placeholder="https://…" value={draft.url} onChange={(event) => updateDraft('url', event.target.value)} /></label>
              <details className="import-advanced"><summary>Advanced options (optional)</summary>
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
              </details>
              <button className="primary-button" disabled={importing}>{importing ? 'Analyzing…' : 'Analyze & import'}</button>
              <button type="button" className="secondary-button" disabled={importing} onClick={() => void importPageListings()}>Import titles listed on this page</button>
              {scanningCatalog && <button type="button" className="secondary-button" onClick={() => { stopCatalogImport.current = true; setNotice('Stopping after the current batch…') }}>Stop catalog scan</button>}
            </form>
            {catalogSections.length > 0 && <div><p>More catalog sections found. Select one, then import its titles:</p>{catalogSections.map((section) => <button type="button" className="secondary-button" key={section.url} disabled={importing} onClick={() => updateDraft('url', section.url)}>{section.title}</button>)}</div>}
            <p className="fine-print">Vivid saves original source URLs. It does not copy, proxy, DRM-bypass, or rebroadcast media.</p>
            <p className="fine-print">When page analysis is enabled, the URL is sent to the Vivid analysis service.</p>
          </details>
        <div className="section-heading"><div><span className="section-eyebrow">PRIVATE CATALOG</span><h1>Library</h1></div><input className="search-input" placeholder="Search title, actor, franchise, tag…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="library-filters">
          <label>Type<select aria-label="Type" value={filters.type} onChange={(event) => setFilters((value) => ({ ...value, type: event.target.value }))}><option value="">All types</option><option value="movie">Movies</option><option value="series">Series</option><option value="episode">Episodes</option></select></label>
          <label>Genre<select aria-label="Genre" value={filters.genre} onChange={(event) => setFilters((value) => ({ ...value, genre: event.target.value }))}><option value="">All genres</option>{[...new Set(library.media.flatMap((item) => item.genres ?? []))].sort().map((genre) => <option key={genre}>{genre}</option>)}</select></label>
          <label>Country<select aria-label="Country" value={filters.country} onChange={(event) => setFilters((value) => ({ ...value, country: event.target.value }))}><option value="">All countries</option>{[...new Set(library.media.flatMap((item) => item.countries ?? []))].sort().map((country) => <option key={country}>{country}</option>)}</select></label>
          <label>Year<select aria-label="Year" value={filters.year} onChange={(event) => setFilters((value) => ({ ...value, year: event.target.value }))}><option value="">All years</option>{[...new Set(library.media.flatMap((item) => mediaYear(item) ? [mediaYear(item)!] : []))].sort((a, b) => b - a).map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
          <label>Sort<select aria-label="Sort" value={filters.sort} onChange={(event) => setFilters((value) => ({ ...value, sort: event.target.value as LibraryFilters['sort'] }))}><option value="added">Date added</option><option value="title">Title</option><option value="year">Year</option><option value="rating">Source rating</option><option value="votes">Popularity (source rating count)</option><option value="imdb">IMDb rating</option><option value="metacritic">Metacritic score</option><option value="budget">Budget (USD)</option><option value="revenue">Revenue (USD)</option></select></label>
          <label>Order<select aria-label="Order" value={filters.order} onChange={(event) => setFilters((value) => ({ ...value, order: event.target.value as LibraryFilters['order'] }))}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
          <button className="secondary-button" onClick={() => { setFilters(defaultFilters); setSearch('') }}>Clear</button>
        </div>
        <button className="secondary-button" disabled={importing} onClick={() => void repairPosters(true)}>Refresh missing posters</button>
        <p className="fine-print">Filters use the metadata available for each title; some sources do not provide genre, country, ratings, or financial details.</p>
        <div className="filter-summary">{formatStat({ value: visibleMedia.length, unit: visibleMedia.length === 1 ? 'item' : 'items', source: 'local library', period: 'this session', state: 'measured' })}</div>
        <MediaGrid media={visibleMedia} activeId={activeId} onPlay={playFromLibrary} onRemove={removeMedia} />
      </section>}

      {view === 'playlists' && <section className="content-section">
        <div className="section-heading"><div><span className="section-eyebrow">CURATED QUEUES</span><h1>Playlists</h1></div></div>
        <form className="inline-form" onSubmit={createPlaylist}><input value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} placeholder="New playlist name" /><button className="primary-button">Create playlist</button></form>
        {deletedPlaylist && <button className="secondary-button" onClick={undoPlaylistDelete}>Undo delete of {deletedPlaylist.playlist.name}</button>}
        <div className="playlist-grid">
          {library.playlists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} media={library.media} onDelete={() => deletePlaylist(playlist)} onCreateChannel={() => createChannelFromPlaylist(playlist)} onRename={(name) => updateLibrary((current) => ({ ...current, playlists: current.playlists.map((entry) => entry.id === playlist.id ? { ...entry, name } : entry) }))} onChange={(id, add) => updatePlaylist(playlist.id, id, add)} onMove={(id, direction) => moveInPlaylist(playlist.id, id, direction)} onPlay={(id) => { setActiveChannelId(undefined); setActivePlaylistId(playlist.id); setActiveId(id); setPlayerEngaged(true); setShouldAutoPlay(true); setMinimizedPlayer(false); setView('player') }} />)}
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

      {view === 'history' && <section className="content-section history-view">
        <div className="section-heading"><div><span className="section-eyebrow">RECENTLY PLAYED</span><h1>History</h1><p>Videos you started on this device. Some embedded players do not report playback.</p></div>{(library.history?.length ?? 0) > 0 && <button className="secondary-button" onClick={() => updateLibrary((current) => ({ ...current, history: [] }))}>Clear history</button>}</div>
        {(library.history ?? []).map((entry, index) => {
          const item = library.media.find((candidate) => candidate.id === entry.mediaId)
          return <article className="history-entry" key={`${entry.mediaId}-${entry.playedAt}-${index}`}><div><strong>{item?.title ?? 'Removed title'}</strong><p>{new Date(entry.playedAt).toLocaleString()}</p></div><div>{item && <button className="secondary-button" onClick={() => playFromLibrary(item.id)}>Play again</button>} <button className="text-button" aria-label={`Remove history entry ${item?.title ?? 'removed title'}`} onClick={() => updateLibrary((current) => ({ ...current, history: (current.history ?? []).filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button></div></article>
        })}
        {!library.history?.length && <div className="empty-state">Your recently played videos will appear here.</div>}
      </section>}

      {view === 'settings' && <section className="content-section settings-view">
        <span className="section-eyebrow">DATA & PROVIDERS</span><h1>Your library stays yours.</h1>
        <section className="content-section"><h2>Private AI gateway</h2><p>Connect your self-hosted Vivid gateway over HTTPS. Your password is not saved. Your session stays in this browser profile until you sign out or it expires. AI search sends your request and selected library metadata to that gateway.</p>
          {aiSession ? <><p>Connected for this session.</p><button className="secondary-button" onClick={() => { const session = aiSession; setAiSession(undefined); try { window.localStorage.removeItem('vivid-ai-session'); window.sessionStorage.removeItem('vivid-ai-session') } catch { /* Already disconnected locally. */ }; setAiResult(undefined); setBotTokens([]); setNewBotToken(''); void aiLogout(session).then(() => setNotice('AI gateway disconnected.')).catch(() => setNotice('Disconnected locally; the gateway session could not be revoked.')) }}>Disconnect AI</button></> : <form className="inline-form" onSubmit={connectAi}><input aria-label="AI gateway URL" placeholder="https://your-server.example" value={gatewayAddress} onChange={(event) => setGatewayAddress(event.target.value)} required /><input aria-label="AI account username" placeholder="Username" autoComplete="username" value={gatewayUser} onChange={(event) => setGatewayUser(event.target.value)} required /><input aria-label="AI account password" type="password" placeholder="Password" autoComplete="current-password" value={gatewayPassword} onChange={(event) => setGatewayPassword(event.target.value)} required /><button className="primary-button" disabled={aiBusy}>Connect AI</button></form>}
        </section>
        <section className="content-section"><h2>Private library sync</h2><p role="status">{syncStatus}</p><p>Your signed-in server library synchronizes while Vivid is open. If the same item changes on two devices, syncing stops instead of overwriting either copy. Export a local backup before resolving a conflict.</p>{aiSession && <button className="secondary-button" onClick={() => { if (syncRef.current) syncRef.current.halted = false; void synchronizeLibrary() }}>Retry sync</button>}</section>
        <section className="content-section"><h2>Agent access</h2><p>Create a separate token for an agent and choose what it can manage. Tokens expire after 30 days and can be revoked here. Bot access requires a connected Vivid server.</p>
          {!aiSession ? <p>Connect your private gateway above to manage agent tokens.</p> : <>
            <form onSubmit={generateBotToken}><label>Token name<input value={botName} onChange={(event) => setBotName(event.target.value)} placeholder="e.g. Library agent" required maxLength={80} /></label><div className="bot-scopes">{([['library:read', 'Read library metadata'], ['sources:manage', 'Manage sources'], ['playlists:manage', 'Manage playlists'], ['channels:manage', 'Create channels'], ['inference', 'Use configured AI']] as Array<[BotScope, string]>).map(([scope, label]) => <label className="checkbox-row" key={scope}><input type="checkbox" checked={botScopes.includes(scope)} onChange={(event) => setBotScopes((current) => event.target.checked ? [...current, scope] : current.filter((entry) => entry !== scope))} /> {label}</label>)}</div><button className="primary-button" disabled={!botScopes.length}>Generate token</button></form>
            {newBotToken && <div className="bot-token-reveal"><p>Copy this token now. Vivid will not show it again.</p><input aria-label="New bot token" value={newBotToken} readOnly onFocus={(event) => event.currentTarget.select()} /><button className="secondary-button" onClick={() => { void navigator.clipboard.writeText(newBotToken).then(() => setNotice('Bot token copied.')).catch(() => setBotError('Could not copy automatically; select the token and copy it.')) }}>Copy token</button> <button className="text-button" onClick={() => setNewBotToken('')}>Dismiss</button></div>}
            {botError && <p role="alert">{botError}</p>}
            {botTokens.map((token) => <div className="bot-token-row" key={token.id}><span><strong>{token.name}</strong> · {token.scopes.join(', ')} · {token.revoked ? 'Revoked' : `Expires ${new Date(token.expiresAt * 1000).toLocaleDateString()}`}</span>{!token.revoked && <button className="secondary-button" onClick={() => { void revokeBotToken(aiSession, token.id).then(() => refreshBotTokens(aiSession)).catch((error) => setBotError(error instanceof Error ? error.message : 'Could not revoke token.')) }}>Revoke</button>}</div>)}
          </>}
        </section>
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
  const [limit, setLimit] = useState(96)
  if (!media.length) return <div className="empty-state">Nothing here yet. Import a source to start building your collection.</div>
  return <><div className="media-grid">{media.slice(0, limit).map((item) => <article key={item.id} className={`media-card ${item.id === activeId ? 'is-active' : ''} ${item.contentType === 'movie' || item.contentType === 'series' ? 'portrait-poster' : ''}`}>
    <button className="card-play" onClick={() => onPlay(item.id)} aria-label={`Play ${item.title}`}>
      <PosterImage item={item} />
      <span className="play-circle">▶</span>
    </button>
    <div className="card-meta"><div><span className="provider-badge">{sourceGlyph(item.provider)} {providerLabel(item.provider)}</span><h3>{item.title}</h3><p>{item.franchise || item.series || item.tags.slice(0, 2).join(' · ') || item.kind}</p></div><button className="remove-button" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.title}`}>×</button></div>
  </article>)}</div>{limit < media.length && <button className="secondary-button" onClick={() => setLimit((value) => value + 96)}>Show more ({Math.min(limit, media.length)} of {media.length})</button>}</>
}

function PosterImage({ item }: { item: MediaItem }) {
  const candidates = useMemo(() => item.poster ? posterSources(item.poster, item.provider, item.externalId) : [], [item.poster, item.provider, item.externalId])
  const [index, setIndex] = useState(0)
  useEffect(() => { setIndex(0) }, [candidates])
  return candidates[index] ? <img src={candidates[index]} alt="" loading="lazy" onError={() => setIndex((current) => current + 1)} /> : <div className={`poster-fallback provider-${item.provider}`}>{sourceGlyph(item.provider)}</div>
}

function PlaylistCard({ playlist, media, onPlay, onChange, onMove, onDelete, onCreateChannel, onRename }: { playlist: Playlist; media: MediaItem[]; onPlay: (id: string) => void; onChange: (id: string, add: boolean) => void; onMove: (id: string, direction: -1 | 1) => void; onDelete: () => void; onCreateChannel: () => void; onRename: (name: string) => void }) {
  const [name, setName] = useState(playlist.name)
  const [editing, setEditing] = useState(false)
  const [editSearch, setEditSearch] = useState('')
  const entries = playlist.mediaIds.map((id) => media.find((item) => item.id === id)).filter((item): item is MediaItem => Boolean(item))
  return <article className="playlist-card"><div className="playlist-cover"><span>≋</span></div><div><span className="section-eyebrow">PLAYLIST</span><h2>{playlist.name}</h2><p>{entries.length} saved title{entries.length === 1 ? '' : 's'}</p>{entries[0] && <button className="text-button" onClick={() => onPlay(entries[0].id)}>Play first →</button>}
    {entries.length > 0 && <ol>{entries.map((item, index) => <li key={item.id}>{item.title} <button type="button" className="text-button" disabled={index === 0} aria-label={`Move ${item.title} earlier`} onClick={() => onMove(item.id, -1)}>↑</button> <button type="button" className="text-button" disabled={index === entries.length - 1} aria-label={`Move ${item.title} later`} onClick={() => onMove(item.id, 1)}>↓</button></li>)}</ol>}
    <div><button className="secondary-button" disabled={!entries.length} onClick={onCreateChannel}>Create channel</button> <button className="secondary-button" aria-label={`Delete ${playlist.name}`} onClick={onDelete}>Delete playlist</button></div>
    <details><summary>Rename playlist</summary><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onRename(name.trim()) }}><input aria-label={`Rename ${playlist.name}`} value={name} onChange={(event) => setName(event.target.value)} /><button className="secondary-button">Save name</button></form></details>
    <details onToggle={(event) => setEditing(event.currentTarget.open)}><summary>Edit titles</summary>{editing && <><input aria-label="Search titles to edit" placeholder="Search titles…" value={editSearch} onChange={(event) => setEditSearch(event.target.value)} />{media.filter((item) => item.title.toLowerCase().includes(editSearch.toLowerCase())).slice(0, 100).map((item) => <label className="checkbox-row" key={item.id}><input type="checkbox" checked={playlist.mediaIds.includes(item.id)} onChange={(event) => onChange(item.id, event.target.checked)} /> {item.title}</label>)}<p>Showing up to 100 titles. Search to find others.</p></>}</details></div></article>
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
