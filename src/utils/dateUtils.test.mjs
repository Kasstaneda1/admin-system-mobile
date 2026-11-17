import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAuthorTimeShort } from './dateUtils.js';

const NOW = Date.parse('2026-11-17T15:00:00Z');

test('short author time: the author’s clock, no year this year, no zone for New York', () => {
  assert.equal(formatAuthorTimeShort('2026-11-06T15:12:00.000Z', 'America/New_York', null, NOW).replace(/ /g, ' '), 'Nov 6, 10:12 AM');
  assert.equal(formatAuthorTimeShort('2026-11-06T15:12:00.000Z', null, null, NOW).replace(/ /g, ' '), 'Nov 6, 10:12 AM');
  assert.equal(formatAuthorTimeShort('2026-11-06T15:12:00.000Z', 'America/Los_Angeles', null, NOW).replace(/ /g, ' '), 'Nov 6, 7:12 AM (Los Angeles)');
  assert.equal(formatAuthorTimeShort('2025-12-31T15:00:00Z', 'Bad/Zone', null, NOW).replace(/ /g, ' '), 'Dec 31, 2025, 10:00 AM');
  assert.equal(formatAuthorTimeShort(null, null, '2026-11-06 15:12:00.123', NOW).replace(/ /g, ' '), 'Nov 6, 10:12 AM');
  assert.equal(formatAuthorTimeShort(null, null, null, NOW), '');
});
