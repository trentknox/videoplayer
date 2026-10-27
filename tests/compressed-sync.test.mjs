import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import { putRemoteLibrary } from '../src/cloudSync.ts'
test('large private library uploads use bounded gzip payloads', async () => {
 const oldFetch = globalThis.fetch
 try {
  globalThis.fetch = async (_url, options) => {
   assert.equal(options.headers['Content-Encoding'], 'gzip')
   const compressed = Buffer.from(await options.body.arrayBuffer())
   const decoded = JSON.parse(gunzipSync(compressed).toString())
   assert.equal(decoded.state.media[0].description.length, 2 * 1024 * 1024)
   assert.ok(compressed.length < 10000)
   return new Response(JSON.stringify({revision: 1}), {status:200})
  }
  const library = {media:[{id:'test', description:'x'.repeat(2 * 1024 * 1024)}],playlists:[],channels:[],sources:[],history:[]}
  assert.equal(await putRemoteLibrary({endpoint:'http://127.0.0.1:3021',token:'test'},0,library),1)
 } finally { globalThis.fetch = oldFetch }
})
