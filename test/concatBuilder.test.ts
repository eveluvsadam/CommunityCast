import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildConcatPlan } from '../src/main/playout/concatBuilder.ts'
import type { ScheduleBlockWithMedia } from '../src/shared/types.ts'

const block = (id: number, filePath: string): ScheduleBlockWithMedia =>
  ({
    id, dailyScheduleId: 1, mediaItemId: id, orderIndex: id, startTime: null,
    media: { id, title: `clip ${id}`, filePath, mediaType: 'program', durationMs: 1000,
             resolution: null, codec: null, thumbnailPath: null, createdAt: '' }
  }) as ScheduleBlockWithMedia

test('refuses an empty lineup', () => {
  assert.throws(() => buildConcatPlan([]), /no blocks/)
})

test('one input, one video and one audio chain per clip, in order', () => {
  const plan = buildConcatPlan([block(1, '/a.mp4'), block(2, '/b.mov'), block(3, '/c.mkv')])
  assert.deepEqual(plan.inputArgs, ['-i', '/a.mp4', '-i', '/b.mov', '-i', '/c.mkv'])
  assert.match(plan.filterComplex, /\[v0\]\[a0\]\[v1\]\[a1\]\[v2\]\[a2\]concat=n=3:v=1:a=1/)
  assert.deepEqual(plan.mapArgs, ['-map', '[outv]', '-map', '[outa]'])
  // Inputs are never paced individually (-re), only the concatenated output.
  assert.ok(!plan.inputArgs.includes('-re'))
  assert.match(plan.filterComplex, /\[cv\]realtime\[outv\];\[ca\]arealtime\[outa\]$/)
})

// Runs the plan through real ffmpeg when the bundled binary is installed.
const require = createRequire(import.meta.url)
let ffmpeg: string | null = null
try { ffmpeg = require('ffmpeg-static') as string } catch { /* not installed */ }

test('ffmpeg accepts the filter graph for clips of different sizes', { skip: !ffmpeg || !existsSync(ffmpeg) }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-concat-'))
  try {
    const make = (name: string, size: string, layout: string) => {
      const out = join(dir, name)
      execFileSync(ffmpeg!, ['-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=25:duration=1`,
        '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=1`,
        '-ac', layout === 'mono' ? '1' : '2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', out])
      return out
    }
    const plan = buildConcatPlan([block(1, make('a.mp4', '640x360', 'mono')), block(2, make('b.mp4', '480x640', 'stereo'))])
    const out = join(dir, 'out.mp4')
    execFileSync(ffmpeg!, ['-loglevel', 'error', '-y', ...plan.inputArgs, '-filter_complex', plan.filterComplex,
      ...plan.mapArgs, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', out])
    assert.ok(existsSync(out))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
