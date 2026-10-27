export type Provider = 'youtube' | 'twitch' | 'plex' | 'cloudflare-stream' | 'direct' | 'embed'
export type MediaKind = 'video' | 'playlist' | 'channel' | 'catalog' | 'stream'

export interface MediaItem {
  id: string
  provider: Provider
  kind: MediaKind
  sourceUrl: string
  embedUrl: string
  playerOptions?: Array<{ name: string; url: string }>
  externalId?: string
  title: string
  description?: string
  contentType?: 'movie' | 'series' | 'episode'
  contentRating?: string
  genres?: string[]
  countries?: string[]
  year?: number
  rating?: number
  budgetUsd?: number
  revenueUsd?: number
  poster?: string
  durationSeconds: number
  tags: string[]
  franchise?: string
  series?: string
  season?: number
  episode?: number
  actors: string[]
  addedAt: string
  importMode: 'single' | 'playlist' | 'channel' | 'catalog' | 'page-analysis'
}

export interface Playlist {
  id: string
  name: string
  mediaIds: string[]
  createdAt: string
}

export interface Channel {
  id: string
  name: string
  description: string
  accent: string
  filter: string
  anchor: string
  durationHours: number
}

export interface ScheduleSlot {
  id: string
  channelId: string
  mediaId: string
  startsAt: string
  endsAt: string
}

export interface LibraryState {
  media: MediaItem[]
  playlists: Playlist[]
  channels: Channel[]
  catalogCursors?: Record<string, string>
  catalogJobs?: Record<string, CatalogJob>
  sources?: SavedSource[]
}

export interface CatalogJob { current?: string; pending: string[]; seen: string[]; seriesNames?: Record<string, string> }
export interface SavedSource { id: string; url: string; lastChecked?: string }

export interface ImportDraft {
  url: string
  title: string
  tags: string
  franchise: string
  series: string
  season: string
  episode: string
  actors: string
  durationMinutes: string
}

export interface AnalysisResult {
  provider: Provider
  kind: MediaKind
  sourceUrl: string
  embedUrl: string
  playerOptions?: Array<{ name: string; url: string }>
  externalId?: string
  title: string
  poster?: string
  description?: string
  contentType?: 'movie' | 'series' | 'episode'
  contentRating?: string
  genres?: string[]
  countries?: string[]
  year?: number
  rating?: number
  budgetUsd?: number
  revenueUsd?: number
  actors?: string[]
  durationSeconds?: number
  notes?: string[]
  listings?: Array<{ url: string; title: string; poster?: string; season?: number; episode?: number }>
  catalogSections?: Array<{ url: string; title: string }>
  suggestedCatalogUrl?: string
  nextCatalogUrl?: string
  analysisUnavailable?: boolean
}
