import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzePublicPage, analyzeUrl } from '../src/providers.ts'

globalThis.window = { location: { hostname: 'localhost' } }

test('desktop fallback discovers exposed video on CORS-readable pages', async () => {
  const originalFetch = globalThis.fetch
  const originalParser = globalThis.DOMParser
  globalThis.fetch = async (url) => {
    if (url === '/api/analyze') throw new Error('No desktop API')
    return { ok: true, url: 'https://example.com/show', headers: new Headers({ 'content-type': 'text/html' }), text: async () => '<html></html>' }
  }
  globalThis.DOMParser = class {
    parseFromString() {
      return { title: 'Example show', querySelector(selector) {
        return selector.includes('og:video:secure_url') ? { getAttribute: () => '/video.mp4' } : null
      } }
    }
  }
  try {
    const result = await analyzePublicPage('https://example.com/show')
    assert.equal(result.provider, 'direct')
    assert.equal(result.embedUrl, 'https://example.com/video.mp4')
    assert.equal(result.title, 'Example show')
  } finally { globalThis.fetch = originalFetch; globalThis.DOMParser = originalParser }
})

test('unreachable pages remain source records and Stream lookalikes are not trusted', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('offline') }
  try {
    const result = await analyzePublicPage('https://example.com/show')
    assert.equal(result.kind, 'catalog')
    assert.match(result.notes[0], /unavailable/)
    assert.notEqual(analyzeUrl('https://cloudflarestream.com.example.org/abc').provider, 'cloudflare-stream')
    assert.equal(analyzeUrl('https://customer-example.cloudflarestream.com/abc/iframe').provider, 'cloudflare-stream')
  } finally { globalThis.fetch = originalFetch }
})
