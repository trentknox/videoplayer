import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultFilters, filterLibrary } from '../src/filters.ts'
test('filters identify older catalog titles from source paths and title years', () => {
 const base = { provider: 'embed', kind: 'video', tags: [], actors: [], addedAt: '2026-01-01T00:00:00Z' }
 const items = [{...base, id:'m', sourceUrl:'https://example.test/watch-movie/one', title:'One (2025)'}, {...base, id:'s', sourceUrl:'https://example.test/watch-tv/two', title:'Two (2020)'}, {...base, id:'u', sourceUrl:'https://example.test/other', title:'Unknown'}]
 assert.deepEqual(filterLibrary(items, {...defaultFilters,type:'movie',year:'2025'}).map(x=>x.id), ['m'])
 assert.deepEqual(filterLibrary(items, {...defaultFilters,type:'series'}).map(x=>x.id), ['s'])
 assert.deepEqual(filterLibrary(items, {...defaultFilters,sort:'year',order:'desc'}).map(x=>x.id), ['m','s','u'])
})
