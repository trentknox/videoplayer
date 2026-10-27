import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adjacentChannel } from '../src/channelNavigation.ts'

test('channel surfing wraps in both directions without selecting a missing channel', () => {
  const channels = [{ id: 'first' }, { id: 'second' }, { id: 'third' }]
  assert.equal(adjacentChannel(channels, 'first', -1)?.id, 'third')
  assert.equal(adjacentChannel(channels, 'third', 1)?.id, 'first')
  assert.equal(adjacentChannel(channels, 'missing', 1), undefined)
  assert.equal(adjacentChannel([channels[0]], 'first', 1), undefined)
})
