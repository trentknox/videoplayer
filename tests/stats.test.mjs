import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatStat, compareTrend } from '../src/stats.ts';

test('measured zero stays zero with unit, source and period', () => {
  assert.equal(formatStat({ value: 0, unit: 'items', source: 'local library', period: 'this session', state: 'measured' }), '0 items · local library · this session');
  assert.equal(formatStat({ value: 0, unit: 'hours', source: 'private server', period: 'last 7 days', state: 'measured' }), '0 hours · private server · last 7 days');
});

test('measured one reads singular unit', () => {
  assert.equal(formatStat({ value: 1, unit: 'item', source: 'local library', period: 'this session', state: 'measured' }), '1 item · local library · this session');
});

test('null or unmeasured shows Not measured and never 0', () => {
  assert.equal(formatStat({ value: null, unit: 'item', source: 'local library', period: 'this session', state: 'unmeasured' }), 'Not measured · local library · this session');
  assert.equal(formatStat({ value: undefined, unit: 'item', source: 'local library', period: 'this session', state: 'measured' }), 'Not measured · local library · this session');
});

test('unavailable or error shows its cause', () => {
  assert.equal(formatStat({ value: null, unit: 'item', source: 'private server', period: 'this session', state: 'unavailable', detail: 'HTTP 403' }), 'Unavailable · HTTP 403 · private server · this session');
  assert.equal(formatStat({ value: null, unit: 'item', source: 'private server', period: 'this session', state: 'unavailable' }), 'Unavailable · unavailable · private server · this session');
});

test('stale values are labelled stale', () => {
  assert.equal(formatStat({ value: 3, unit: 'items', source: 'local library', period: 'this session', state: 'stale' }), '3 items · local library · this session · stale');
});

test('unknown cause shows Unavailable without inventing a cause', () => {
  assert.equal(formatStat({ value: null, unit: 'item', source: 'private server', period: 'this session', state: 'unavailable', detail: undefined }), 'Unavailable · unavailable · private server · this session');
});

test('trend is reported only with a valid previous comparison', () => {
  assert.equal(compareTrend(5, null), null);
  assert.equal(compareTrend(5, undefined), null);
  assert.equal(compareTrend(5, 5), 'flat');
  assert.equal(compareTrend(7, 5), 'up');
  assert.equal(compareTrend(3, 5), 'down');
});
