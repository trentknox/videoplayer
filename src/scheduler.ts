import type { Channel, MediaItem, ScheduleSlot } from './types'

const minimumDuration = 60

function itemMatches(item: MediaItem, filter: string): boolean {
  const needle = filter.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    item.title, item.provider, item.kind, item.franchise, item.series, item.season, item.episode,
    ...item.tags, ...item.actors,
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(needle)
}

export function makeSchedule(channel: Channel, media: MediaItem[], at = new Date()): ScheduleSlot[] {
  const candidates = media.filter((item) => itemMatches(item, channel.filter))
  if (!candidates.length) return []
  const anchor = new Date(channel.anchor).getTime()
  const cycle = Math.max(1, channel.durationHours || 24) * 60 * 60 * 1000
  if (!Number.isFinite(anchor) || !Number.isFinite(at.getTime())) return []
  const cycleIndex = Math.max(0, Math.floor((at.getTime() - anchor) / cycle))
  const start = anchor + cycleIndex * cycle
  const end = start + cycle
  const slots: ScheduleSlot[] = []
  let cursor = start
  let index = 0
  while (cursor < end) {
    const item = candidates[index % candidates.length]
    const duration = Math.max(Number.isFinite(item.durationSeconds) ? item.durationSeconds : minimumDuration, minimumDuration) * 1000
    const next = Math.min(cursor + duration, end)
    slots.push({
      id: `${channel.id}-${cursor}-${item.id}`,
      channelId: channel.id,
      mediaId: item.id,
      startsAt: new Date(cursor).toISOString(),
      endsAt: new Date(next).toISOString(),
    })
    cursor = next
    index += 1
  }
  return slots
}

export function nowPlaying(slots: ScheduleSlot[], at = new Date()): ScheduleSlot | undefined {
  const timestamp = at.getTime()
  return slots.find((slot) => timestamp >= new Date(slot.startsAt).getTime() && timestamp < new Date(slot.endsAt).getTime())
}

export function formatClock(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}
