import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDuration, formatBytes, formatEta } from '../src/renderer/src/lib/format.ts'

test('formatDuration', () => {
  assert.equal(formatDuration(null), '—')
  assert.equal(formatDuration(6_000), '0:06')
  assert.equal(formatDuration(65_000), '1:05')
  assert.equal(formatDuration(3_661_000), '1:01:01')
})

test('formatBytes', () => {
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(2048), '2 KB')
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB')
  assert.equal(formatBytes(3 * 1024 ** 3), '3.00 GB')
})

test('formatEta', () => {
  assert.equal(formatEta(100, null), null)
  assert.equal(formatEta(100, 0), null)
  assert.equal(formatEta(10, 100), 'almost done')
  assert.equal(formatEta(3000, 100), '~30s remaining')
  assert.equal(formatEta(30_000, 100), '~5m remaining')
})
