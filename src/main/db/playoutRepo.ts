import type Database from 'better-sqlite3'
import type { PlayoutState, PlayoutStatus } from '@shared/types'

interface PlayoutStateRow {
  current_block_id: number | null
  block_started_at: string | null
  offset_ms: number
  status: PlayoutStatus
}

export function getPlayoutState(db: Database.Database): PlayoutState {
  const row = db.prepare('SELECT * FROM playout_state WHERE id = 1').get() as PlayoutStateRow
  return {
    currentBlockId: row.current_block_id,
    blockStartedAt: row.block_started_at,
    offsetMs: row.offset_ms,
    status: row.status
  }
}

export function setPlayoutState(db: Database.Database, state: PlayoutState): void {
  db.prepare(
    `UPDATE playout_state
     SET current_block_id = @currentBlockId,
         block_started_at = @blockStartedAt,
         offset_ms = @offsetMs,
         status = @status
     WHERE id = 1`
  ).run({
    currentBlockId: state.currentBlockId,
    blockStartedAt: state.blockStartedAt,
    offsetMs: state.offsetMs,
    status: state.status
  })
}
