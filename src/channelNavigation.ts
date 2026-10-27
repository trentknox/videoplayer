import type { Channel } from './types'

export function adjacentChannel(channels: Channel[], currentId: string, step: -1 | 1): Channel | undefined {
  const index = channels.findIndex((channel) => channel.id === currentId)
  if (index < 0 || channels.length < 2) return undefined
  return channels[(index + step + channels.length) % channels.length]
}
