import { EventEmitter } from 'events'
import type Database from 'better-sqlite3'
import type { PlayoutTick, ScheduleBlockWithMedia } from '@shared/types'
import { listBlocksWithMedia, getOrCreateDailySchedule } from '../db/scheduleRepo'
import { getPlayoutState, setPlayoutState } from '../db/playoutRepo'

// If a media item's duration is unknown (probe failed), we still need to advance
// eventually rather than hang on that block forever.
const FALLBACK_BLOCK_DURATION_MS = 10_000

export declare interface PlayoutEngine {
  on(event: 'tick', listener: (tick: PlayoutTick) => void): this
  on(event: 'blockChanged', listener: (block: ScheduleBlockWithMedia) => void): this
  emit(event: 'tick', tick: PlayoutTick): boolean
  emit(event: 'blockChanged', block: ScheduleBlockWithMedia): boolean
}

/**
 * Plays a published day's schedule in order, looping back to the start when it
 * reaches the end — a real channel doesn't go dark, it recycles the day's lineup.
 *
 * Simplification (documented, not hidden): this MVP slice advances purely by
 * each block's duration from when playout started, rather than gating against
 * the wall-clock start_time computed at publish. Wall-clock-accurate scheduling
 * (so the 3pm block airs at 3pm even after a relaunch) is Phase 6 hardening —
 * see README. For now, "Go Live" starts the lineup from block 1 and it runs
 * continuously from there.
 */
export class PlayoutEngine extends EventEmitter {
  private db: Database.Database
  private blocks: ScheduleBlockWithMedia[] = []
  private currentIndex = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private blockStartedAt: Date | null = null
  private running = false

  constructor(db: Database.Database) {
    super()
    this.db = db
  }

  isRunning(): boolean {
    return this.running
  }

  /** The full ordered lineup currently loaded (empty if not started). */
  getAllBlocks(): ScheduleBlockWithMedia[] {
    return this.blocks
  }

  start(date: string): void {
    const schedule = getOrCreateDailySchedule(this.db, date)
    if (schedule.status !== 'published') {
      throw new Error(`Schedule for ${date} is not published yet`)
    }
    const blocks = listBlocksWithMedia(this.db, schedule.id)
    if (blocks.length === 0) {
      throw new Error(`Schedule for ${date} has no items`)
    }

    this.stop() // clear any prior run first

    this.blocks = blocks
    this.currentIndex = 0
    this.running = true
    this.playCurrent()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.running = false
    this.blockStartedAt = null
    setPlayoutState(this.db, {
      currentBlockId: null,
      blockStartedAt: null,
      offsetMs: 0,
      status: 'idle'
    })
    this.emitTick()
  }

  getTick(): PlayoutTick {
    const current = this.blocks[this.currentIndex] ?? null
    const next = this.blocks.length > 0 ? this.blocks[(this.currentIndex + 1) % this.blocks.length] : null
    return {
      state: getPlayoutState(this.db),
      current,
      next: next && next !== current ? next : this.blocks.length > 1 ? next : null
    }
  }

  private playCurrent(): void {
    const block = this.blocks[this.currentIndex]
    this.blockStartedAt = new Date()

    setPlayoutState(this.db, {
      currentBlockId: block.id,
      blockStartedAt: this.blockStartedAt.toISOString(),
      offsetMs: 0,
      status: 'playing'
    })

    this.emitTick()
    this.emit('blockChanged', block)

    const durationMs = block.media.durationMs ?? FALLBACK_BLOCK_DURATION_MS
    if (!block.media.durationMs) {
      console.warn(
        `[playout] block ${block.id} (${block.media.title}) has unknown duration, using ${FALLBACK_BLOCK_DURATION_MS}ms fallback`
      )
    }

    this.timer = setTimeout(() => this.advance(), durationMs)
  }

  private advance(): void {
    if (!this.running) return
    this.currentIndex = (this.currentIndex + 1) % this.blocks.length
    this.playCurrent()
  }

  private emitTick(): void {
    this.emit('tick', this.getTick())
  }
}
