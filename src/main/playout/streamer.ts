import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { rmSync, existsSync, mkdirSync } from 'fs'
import ffmpegPath from 'ffmpeg-static'
import type { ScheduleBlockWithMedia } from '@shared/types'
import { buildConcatPlan } from './concatBuilder'
import { getHlsDir } from '../library/paths'

const LOG_TAIL_LINES = 60
const RECONNECT_DELAY_MS = 2000 // unexpected failure — backoff to avoid hot-looping a real problem
const FAST_RECONNECT_DELAY_MS = 200 // normal end-of-lineup loop — happens every cycle, keep it snappy
const STALL_CHECK_INTERVAL_MS = 5000
// A residential connection doesn't always cleanly drop — it can go into a
// stuck state where ffmpeg never errors out and exits, it just stops making
// progress. Watching for the process exiting isn't enough on its own; this
// watches ffmpeg's own progress output (the same "time=..." lines the UI's
// health badge parses) going quiet for too long, and force-restarts if so.
const STALL_THRESHOLD_MS = 20000

/**
 * Streams an entire published day's lineup as ONE continuous ffmpeg process
 * (concat filter graph — see concatBuilder.ts) rather than one process per
 * block, so the connection doesn't drop between items (see the concat
 * rewrite history in the README for why that matters).
 *
 * Always writes local HLS segments — this is what lets the channel be
 * watched directly in Safari with no extra software (VLC, accounts, etc.),
 * which is the common case: most people running this don't want to push to
 * YouTube/Twitch, they want to watch their own channel on their own
 * network. Pushing to an external RTMP destination is an *additional*,
 * optional output added to the same ffmpeg process via the tee muxer — not
 * a separate transcode step, which avoids double-encoding CPU cost and a
 * real bug found in node-media-server's own built-in transcoder during
 * testing (an internal ReferenceError, plus segments never actually being
 * written even once that was worked around).
 */
export class RtmpStreamer {
  private proc: ChildProcessWithoutNullStreams | null = null
  private running = false
  private rtmpUrl: string | null = null
  private blocks: ScheduleBlockWithMedia[] = []
  private logTail: string[] = []
  private stopping = false // true only while we're deliberately killing the process ourselves
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private lastProgressAt = 0
  private stallWatchdog: ReturnType<typeof setInterval> | null = null

  isStreaming(): boolean {
    return this.running
  }

  /** Non-null only when also pushing to an external RTMP destination. */
  getRtmpUrl(): string | null {
    return this.rtmpUrl
  }

  getRecentLog(): string[] {
    return this.logTail
  }

  /** Starts (or replaces) the stream, covering the full given lineup on a loop.
   * rtmpUrl is optional — local HLS always runs regardless. */
  start(blocks: ScheduleBlockWithMedia[], rtmpUrl?: string): void {
    if (!ffmpegPath) throw new Error('ffmpeg binary not available (ffmpeg-static path is null)')
    if (blocks.length === 0) throw new Error('Cannot stream an empty lineup')

    this.running = true
    this.rtmpUrl = rtmpUrl ?? null
    this.blocks = blocks

    // Clear stale segments from a previous session so a player can't load an
    // old .m3u8 alongside orphaned .ts files from a different lineup.
    const hlsDir = getHlsDir()
    if (existsSync(hlsDir)) rmSync(hlsDir, { recursive: true, force: true })
    mkdirSync(hlsDir, { recursive: true })

    this.spawnFor(blocks)
  }

  stop(): void {
    this.running = false
    this.rtmpUrl = null
    this.blocks = []
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.killCurrent()
  }

  private spawnFor(blocks: ScheduleBlockWithMedia[]): void {
    if (!ffmpegPath) return

    const plan = buildConcatPlan(blocks)
    const hlsTarget = `${getHlsDir()}/index.m3u8`

    // tee fans one encoded stream out to multiple outputs. Local HLS always
    // runs; the RTMP leg is appended only when an external destination is set.
    // hls_list_size widened from 6→12 segments (12s→24s window): too tight
    // a window means any brief player-side hiccup can fall behind the live
    // edge and try to fetch an already-deleted segment — which looks
    // exactly like a dropped connection. More margin here costs a little
    // extra latency, not reliability.
    const teeTargets = [`[f=hls:hls_time=2:hls_list_size=12:hls_flags=delete_segments]${hlsTarget}`]
    if (this.rtmpUrl) teeTargets.push(`[f=flv]${this.rtmpUrl}`)

    const args = [
      ...plan.inputArgs,
      '-filter_complex',
      plan.filterComplex,
      ...plan.mapArgs,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-b:v',
      '4500k', // scaled up from 2500k for the 1080p canvas (was tuned for 720p)
      '-maxrate',
      '4500k',
      '-bufsize',
      '9000k',
      '-pix_fmt',
      'yuv420p',
      '-g',
      '60', // exactly 2s at 30fps — matches hls_time=2 below, so segments cut cleanly on keyframe boundaries instead of drifting
      '-sc_threshold',
      '0', // disable scene-change keyframe insertion — clip transitions are exactly what triggers it, which would otherwise insert an unpredictable extra keyframe right at the worst possible spot
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      '44100',
      '-f',
      'tee',
      teeTargets.join('|')
    ]

    console.log(
      `[stream] streaming lineup of ${blocks.length} item(s) -> local HLS${
        this.rtmpUrl ? ` + RTMP (${this.rtmpUrl})` : ''
      } (${blocks.map((b) => b.media.title).join(', ')})`
    )
    const proc = spawn(ffmpegPath, args)
    this.proc = proc
    this.stopping = false
    this.lastProgressAt = Date.now() // reset on every (re)spawn, not left over from a previous run

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      this.logTail.push(...text.split('\n').filter(Boolean))
      if (this.logTail.length > LOG_TAIL_LINES) {
        this.logTail = this.logTail.slice(-LOG_TAIL_LINES)
      }
      // ffmpeg's periodic progress line ("frame=... time=... speed=...") is
      // the same thing the UI's health badge parses — its presence means
      // encoding is actually still moving, not just that a process object
      // exists.
      if (text.includes('frame=') && text.includes('speed=')) {
        this.lastProgressAt = Date.now()
      }
    })

    if (this.stallWatchdog) clearInterval(this.stallWatchdog)
    this.stallWatchdog = setInterval(() => {
      if (!this.proc || this.stopping) return
      const silentFor = Date.now() - this.lastProgressAt
      if (silentFor > STALL_THRESHOLD_MS) {
        console.warn(
          `[stream] no encoder progress for ${Math.round(silentFor / 1000)}s — treating as a stalled connection, forcing restart`
        )
        // SIGKILL, not SIGTERM: a genuinely hung process (e.g. blocked on a
        // stuck network write) may not respond to a polite signal at all.
        this.proc.kill('SIGKILL')
      }
    }, STALL_CHECK_INTERVAL_MS)

    proc.on('exit', (code, signal) => {
      console.log(`[stream] ffmpeg exited (code=${code}, signal=${signal})`)
      if (this.proc === proc) this.proc = null
      if (this.stallWatchdog) {
        clearInterval(this.stallWatchdog)
        this.stallWatchdog = null
      }

      // If we killed it ourselves (stop), don't reconnect — that's expected.
      if (this.stopping || !this.running || this.blocks.length === 0) return

      // A clean exit (code 0) means the lineup played through normally and
      // it's time to loop — reconnect fast, since this happens on every
      // single loop of the day's schedule and a slow reconnect here is
      // exactly what makes a short test lineup feel like it's constantly
      // dropping. Anything else is an unexpected failure (crash, network
      // issue) and keeps the longer backoff so a real problem doesn't
      // hot-loop the CPU.
      const delay = code === 0 ? FAST_RECONNECT_DELAY_MS : RECONNECT_DELAY_MS
      console.log(`[stream] restarting lineup in ${delay}ms`)
      this.reconnectTimer = setTimeout(() => {
        if (this.running && this.blocks.length > 0) this.spawnFor(this.blocks)
      }, delay)
    })

    proc.on('error', (err) => {
      console.error('[stream] ffmpeg process error:', err.message)
    })
  }

  private killCurrent(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.stallWatchdog) {
      clearInterval(this.stallWatchdog)
      this.stallWatchdog = null
    }
    if (this.proc) {
      this.stopping = true
      this.proc.kill('SIGTERM')
      this.proc = null
    }
  }
}
