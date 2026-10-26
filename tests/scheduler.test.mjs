import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeSchedule, nowPlaying } from '../src/scheduler.ts'

const channel = { id: 'channel', anchor: '2026-01-01T00:00:00Z', durationHours: 24, filter: '' }
const media = [
  { id: 'a', title: 'First', provider: 'direct', kind: 'video', tags: ['science'], actors: [], durationSeconds: 3600 },
  { id: 'b', title: 'Second', provider: 'direct', kind: 'video', tags: [], actors: ['Example Actor'], durationSeconds: 1800 },
]

test('a recurring schedule resolves the current slot after multiple days', () => {
  const at = new Date('2026-01-04T12:30:00Z')
  const slot = nowPlaying(makeSchedule(channel, media, at), at)
  assert.equal(slot?.mediaId, 'a')
  assert.equal(slot?.startsAt, '2026-01-04T12:00:00.000Z')
})

test('slot boundaries switch titles and a repeated title has a new slot identity', () => {
  const at = new Date('2026-01-01T00:00:00Z')
  const slots = makeSchedule(channel, [media[0]], at)
  assert.equal(nowPlaying(slots, new Date('2026-01-01T00:59:59Z'))?.id, slots[0].id)
  assert.equal(nowPlaying(slots, new Date('2026-01-01T01:00:00Z'))?.id, slots[1].id)
  assert.notEqual(slots[0].id, slots[1].id)
})

test('filters apply to actor and tag metadata, and empty matches produce no schedule', () => {
  assert.equal(makeSchedule({ ...channel, filter: 'example actor' }, media)[0]?.mediaId, 'b')
  assert.equal(makeSchedule({ ...channel, filter: 'science' }, media)[0]?.mediaId, 'a')
  assert.deepEqual(makeSchedule({ ...channel, filter: 'no match' }, media), [])
})
