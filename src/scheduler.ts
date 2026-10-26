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

export function makeSchedule(channel: Channel, media: MediaItem[]): ScheduleSlot[] {
  const candidates = media.filter((item) => itemMatches(item, channel.filter))
  if (!candidates.length) return []
  const anchor = new Date(channel.anchor)
  const end = new Date(anchor.getTime() + channel.durationHours * 60 * 60 * 1000)
  const slots: ScheduleSlot[] = []
  let cursor = anchor.getTime()
  let index = 0
  while (cursor < end.getTime()) {
    const item = candidates[index % candidates.length]
    const duration = Math.max(item.durationSeconds, minimumDuration) * 1000
    const next = Math.min(cursor + duration, end.getTime())
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
