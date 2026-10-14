import { powerSaveBlocker } from 'electron'
import type Database from 'better-sqlite3'
import type { Server as SocketIOServer } from 'socket.io'
import type { PlayoutStatusResponse } from '@shared/types'
import { PlayoutEngine } from './engine'
import { RtmpStreamer } from './streamer'
import { getSetting, setSetting, deleteSetting } from '../db/settingsRepo'

// Matches the /hls static route mounted in server/index.ts.
const HLS_URL = 'http://127.0.0.1:47811/hls/index.m3u8'
const LAST_LIVE_CONFIG_KEY = 'last_live_config'

interface LastLiveConfig {
  date: string
  rtmpUrl?: string
}

export class PlayoutController {
  private engine: PlayoutEngine
  private streamer: RtmpStreamer
  private io: SocketIOServer
  private db: Database.Database
  private powerSaveBlockerId: number | null = null

  constructor(db: Database.Database, io: SocketIOServer) {
    this.engine = new PlayoutEngine(db)
    this.streamer = new RtmpStreamer()
    this.io = io
    this.db = db

    this.engine.on('tick', () => this.broadcast())
    // Note: the streamer no longer needs to react to individual block changes.
    // It runs the whole day's lineup as one continuous ffmpeg process (see
    // streamer.ts) so the RTMP connection doesn't drop between items. The
    // engine's own tick/block tracking still drives the UI's Now/Next display
    // and local monitor preview — it's a separate clock from the streamer's
    // internal playback position, walking the same ordered lineup, but the
    // two aren't frame-synced to each other. Documented simplification, not
    // a hidden gap.
  }

  /** rtmpUrl is optional — going live always produces local HLS regardless;
   * an RTMP URL additionally pushes to that external destination. */
  start(date: string, rtmpUrl?: string): PlayoutStatusResponse {
    this.engine.start(date) // throws if not published / empty — let the route surface that

    const blocks = this.engine.getAllBlocks()
    this.streamer.start(blocks, rtmpUrl)

    // Persisted so a dedicated always-on box (Mac Mini etc.) can recover on
    // its own after an unexpected interruption — crash, power loss, reboot —
    // without anyone needing to notice and click Go Live again. Cleared on
    // an explicit stop() below, so deliberately stopping the channel is
    // remembered as intentional and never gets auto-resumed out from under you.
    const config: LastLiveConfig = { date, rtmpUrl }
    setSetting(this.db, LAST_LIVE_CONFIG_KEY, JSON.stringify(config))

    // Without this, macOS idle sleep (or a closed lid) silently kills the
    // entire broadcast with no warning — a real problem for something meant
    // to run unattended. Only engaged while actually live, not on app
    // launch, so normal (non-streaming) use doesn't keep the Mac awake for
    // no reason.
    if (this.powerSaveBlockerId === null || !powerSaveBlocker.isStarted(this.powerSaveBlockerId)) {
      this.powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension')
    }

    return this.getStatus()
  }

  stop(): PlayoutStatusResponse {
    this.streamer.stop()
    this.engine.stop()
    deleteSetting(this.db, LAST_LIVE_CONFIG_KEY)

    if (this.powerSaveBlockerId !== null && powerSaveBlocker.isStarted(this.powerSaveBlockerId)) {
      powerSaveBlocker.stop(this.powerSaveBlockerId)
    }
    this.powerSaveBlockerId = null

    return this.getStatus()
  }

  /** Called once on app startup. If the channel was live and got interrupted
   * rather than deliberately stopped, goes live again with the same config. */
  resumeIfInterrupted(): void {
    const raw = getSetting(this.db, LAST_LIVE_CONFIG_KEY)
    if (!raw) return

    try {
      const config = JSON.parse(raw) as LastLiveConfig
      console.log(`[playout] resuming interrupted broadcast: date=${config.date}`)
      this.start(config.date, config.rtmpUrl)
    } catch (err) {
      console.warn('[playout] failed to resume previous broadcast:', (err as Error).message)
      deleteSetting(this.db, LAST_LIVE_CONFIG_KEY)
    }
  }

  getStatus(): PlayoutStatusResponse {
    const tick = this.engine.getTick()
    return {
      ...tick,
      isStreaming: this.streamer.isStreaming(),
      rtmpUrl: this.streamer.getRtmpUrl(),
      hlsUrl: this.streamer.isStreaming() ? HLS_URL : null
    }
  }

  getStreamLog(): string[] {
    return this.streamer.getRecentLog()
  }

  private broadcast(): void {
    this.io.emit('playout:tick', this.getStatus())
  }
}
