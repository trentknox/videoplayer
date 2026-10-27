import assert from 'node:assert/strict'
import { test } from 'node:test'
import { entryBundle } from '../src/updateMonitor.ts'

test('detects only same-origin production app entry bundles', () => {
  const base = 'https://app.example/'
  assert.equal(entryBundle('<script type="module" crossorigin src="./assets/index-ABC_123.js"></script>', base), 'https://app.example/assets/index-ABC_123.js')
  assert.equal(entryBundle('<script src="https://other.example/assets/index-X.js" type="module"></script>', base), undefined)
  assert.equal(entryBundle('<script type="module" src="/src/main.tsx"></script>', base), undefined)
})
