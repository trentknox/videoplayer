import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultFilters, filterLibrary } from '../src/filters.ts'

test('filters combine public metadata and keep unknown numeric values after known ones', () => {
  const base = { provider: 'embed', kind: 'video', tags: [], actors: [], addedAt: '2026-01-01T00:00:00Z' }
  const items = [{ ...base, id: 'a', title: 'First', contentType: 'movie', genres: ['Drama'], countries: ['Canada'], year: 2024, rating: 8 }, { ...base, id: 'b', title: 'Second', contentType: 'movie', genres: ['Action'], countries: ['Canada'], year: 2020 }, { ...base, id: 'c', title: 'Third', contentType: 'series', genres: ['Drama'], countries: ['US'], year: 2024, rating: 9 }]
  assert.deepEqual(filterLibrary(items, { ...defaultFilters, type: 'movie', genre: 'Drama', country: 'Canada', year: '2024' }).map((item) => item.id), ['a'])
  assert.deepEqual(filterLibrary(items, { ...defaultFilters, sort: 'rating', order: 'desc' }).map((item) => item.id), ['c', 'a', 'b'])
  assert.deepEqual(filterLibrary(items, { ...defaultFilters, query: 'canada', sort: 'title', order: 'asc' }).map((item) => item.id), ['a', 'b'])
})
