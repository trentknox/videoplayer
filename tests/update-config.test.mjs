import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'

const { hasPublisher } = createRequire(import.meta.url)('../electron/update-config.cjs')

test('automatic updater requires a nonempty Windows publisher', () => {
  assert.equal(hasPublisher('provider: github\npublisherName:\n  - Example Publisher\n'), true)
  assert.equal(hasPublisher('publisherName: Example Publisher\n'), true)
  for (const config of ['', 'publisherName: null', 'publisherName: []', 'publisherName: ""', 'publisherName: [Example, null]', 'invalid: [']) {
    assert.equal(hasPublisher(config), false)
  }
})
