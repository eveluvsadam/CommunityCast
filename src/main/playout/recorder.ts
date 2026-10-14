import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import ffmpegPath from 'ffmpeg-static'
import { getRecordingsDir } from '../library/paths'

const LOG_TAIL_LINES = 40

export interface RecordingStatus {
  recording: boolean
  filePath: string | null
  sourceUrl: string | null
  startedAt: string | null
}

function timestampedFilename(): string {
  const iso = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')
  return `recording-${iso}.mp4`
}

/**
 * Records the actual output stream — pulled from an RTMP URL (your local
 * RTMP relay, a LAN address, or an external destination like a DuckDNS
 * setup) — rather than the source media files. Deliberately a separate
 * process from the broadcast streamer: a recording failure shouldn't be
 * able to affect the live channel, and vice versa.
 *
 * Uses `-c copy` (remux, not re-encode) since the source stream is already
 * correctly encoded. Writes fragmented MP4 (`frag_keyframe+empty_moov`) so
 * the file stays playable even if the app is killed mid-recording rather
 * than stopped cleanly.
 *
 * Why RTMP and not the local HLS URL: during development, reading HLS/MPEG-TS
 * as an *input* reliably crashed ffmpeg (SIGSEGV) in this project's Linux
 * test environment — isolated down to the MPEG-TS demuxer itself (reproduced
 * reading a plain local .ts file directly, no HLS or network involved).
 * ffmpeg's RTMP/FLV reading, by contrast, was directly verified reliable
 * (this is the same mechanism proven out for the "watch beyond your local
 * network" RTMP relay). This may well be specific to that Linux build —
 * ffmpeg-static ships an entirely different compiled binary per platform —
 * but rather than risk shipping a recorder that crashes, this points at the
 * path already proven solid. See README for the practical implication: you
 * need an RTMP source running (the same `npm run rtmp:test-server` used for
 * external streaming) to record locally, not just a live channel.
 */
export class Recorder {
  private proc: ChildProcessWithoutNullStreams | null = null
  private filePath: string | null = null
  private sourceUrl: string | null = null
  private startedAt: string | null = null
  private logTail: string[] = []

  getStatus(): RecordingStatus {
    return {
      recording: this.proc !== null,
      filePath: this.filePath,
      sourceUrl: this.sourceUrl,
      startedAt: this.startedAt
    }
  }

  getRecentLog(): string[] {
    return this.logTail
  }

  start(sourceUrl: string): RecordingStatus {
    if (!ffmpegPath) throw new Error('ffmpeg binary not available (ffmpeg-static path is null)')
    if (this.proc) throw new Error('A recording is already in progress')

    const filePath = join(getRecordingsDir(), timestampedFilename())
    const args = [
      '-i',
      sourceUrl,
      '-c',
      'copy',
      '-f',
      'mp4',
      '-movflags',
      'frag_keyframe+empty_moov',
      filePath
    ]

    console.log(`[recorder] recording ${sourceUrl} -> ${filePath}`)
    const proc = spawn(ffmpegPath, args)
    this.proc = proc
    this.filePath = filePath
    this.sourceUrl = sourceUrl
    this.startedAt = new Date().toISOString()
    this.logTail = []

    proc.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      this.logTail.push(...lines)
      if (this.logTail.length > LOG_TAIL_LINES) this.logTail = this.logTail.slice(-LOG_TAIL_LINES)
    })

    proc.on('exit', (code, signal) => {
      console.log(`[recorder] ffmpeg exited (code=${code}, signal=${signal})`)
      if (this.proc === proc) {
        this.proc = null
        // Deliberately no auto-retry here (unlike the broadcast streamer):
        // a recording silently resuming into a gap the user doesn't notice
        // is worse than a recording that visibly stopped and needs a
        // manual restart. They're relying on this to actually have the footage.
      }
    })

    proc.on('error', (err) => {
      console.error('[recorder] ffmpeg process error:', err.message)
    })

    return this.getStatus()
  }

  stop(): RecordingStatus {
    if (this.proc) {
      // SIGINT (not SIGTERM/SIGKILL) tells ffmpeg to finish up gracefully —
      // flush and finalize the output — rather than cutting it off abruptly.
      this.proc.kill('SIGINT')
      this.proc = null
    }
    const status = this.getStatus()
    this.filePath = null
    this.sourceUrl = null
    this.startedAt = null
    return { ...status, recording: false }
  }
}
