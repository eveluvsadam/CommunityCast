import type Database from 'better-sqlite3'
import type { DailySchedule, ScheduleBlockWithMedia, ScheduleStatus } from '@shared/types'
import { rowToMediaItem, type MediaItemRow } from './mediaRepo'

interface DailyScheduleRow {
  id: number
  date: string
  status: ScheduleStatus
}

function rowToSchedule(row: DailyScheduleRow): DailySchedule {
  return { id: row.id, date: row.date, status: row.status }
}

/** Returns the daily schedule for a date, creating an empty draft if none exists yet. */
export function getOrCreateDailySchedule(db: Database.Database, date: string): DailySchedule {
  const existing = db.prepare('SELECT * FROM daily_schedules WHERE date = ?').get(date) as
    | DailyScheduleRow
    | undefined
  if (existing) return rowToSchedule(existing)

  const result = db
    .prepare('INSERT INTO daily_schedules (date, status) VALUES (?, ?)')
    .run(date, 'draft')
  const created = db
    .prepare('SELECT * FROM daily_schedules WHERE id = ?')
    .get(result.lastInsertRowid) as DailyScheduleRow
  return rowToSchedule(created)
}

interface JoinedBlockRow {
  block_id: number
  daily_schedule_id: number
  media_item_id: number
  order_index: number
  start_time: string | null
  media_id: number
  title: string
  file_path: string
  media_type: MediaItemRow['media_type']
  duration_ms: number | null
  resolution: string | null
  codec: string | null
  thumbnail_path: string | null
  created_at: string
}

export function listBlocksWithMedia(
  db: Database.Database,
  dailyScheduleId: number
): ScheduleBlockWithMedia[] {
  const rows = db
    .prepare(
      `SELECT
         sb.id AS block_id,
         sb.daily_schedule_id AS daily_schedule_id,
         sb.media_item_id AS media_item_id,
         sb.order_index AS order_index,
         sb.start_time AS start_time,
         mi.id AS media_id,
         mi.title AS title,
         mi.file_path AS file_path,
         mi.media_type AS media_type,
         mi.duration_ms AS duration_ms,
         mi.resolution AS resolution,
         mi.codec AS codec,
         mi.thumbnail_path AS thumbnail_path,
         mi.created_at AS created_at
       FROM schedule_blocks sb
       JOIN media_items mi ON mi.id = sb.media_item_id
       WHERE sb.daily_schedule_id = ?
       ORDER BY sb.order_index ASC`
    )
    .all(dailyScheduleId) as JoinedBlockRow[]

  return rows.map((row) => ({
    id: row.block_id,
    dailyScheduleId: row.daily_schedule_id,
    mediaItemId: row.media_item_id,
    orderIndex: row.order_index,
    startTime: row.start_time,
    media: rowToMediaItem({
      id: row.media_id,
      title: row.title,
      file_path: row.file_path,
      media_type: row.media_type,
      duration_ms: row.duration_ms,
      resolution: row.resolution,
      codec: row.codec,
      thumbnail_path: row.thumbnail_path,
      created_at: row.created_at
    })
  }))
}

export function addBlock(
  db: Database.Database,
  dailyScheduleId: number,
  mediaItemId: number
): void {
  const maxOrder = db
    .prepare('SELECT MAX(order_index) as maxOrder FROM schedule_blocks WHERE daily_schedule_id = ?')
    .get(dailyScheduleId) as { maxOrder: number | null }
  const nextOrder = (maxOrder.maxOrder ?? -1) + 1

  db.prepare(
    'INSERT INTO schedule_blocks (daily_schedule_id, media_item_id, order_index) VALUES (?, ?, ?)'
  ).run(dailyScheduleId, mediaItemId, nextOrder)

  // Adding new content invalidates previously computed start times / on-air readiness.
  db.prepare("UPDATE daily_schedules SET status = 'draft' WHERE id = ?").run(dailyScheduleId)
}

export function removeBlock(db: Database.Database, blockId: number): void {
  const block = db.prepare('SELECT daily_schedule_id FROM schedule_blocks WHERE id = ?').get(
    blockId
  ) as { daily_schedule_id: number } | undefined
  if (!block) return

  db.prepare('DELETE FROM schedule_blocks WHERE id = ?').run(blockId)
  db.prepare("UPDATE daily_schedules SET status = 'draft' WHERE id = ?").run(
    block.daily_schedule_id
  )
}

/** Reassigns order_index to match the given block ID order. */
export function reorderBlocks(
  db: Database.Database,
  dailyScheduleId: number,
  blockIds: number[]
): void {
  const update = db.prepare('UPDATE schedule_blocks SET order_index = ? WHERE id = ? AND daily_schedule_id = ?')
  const tx = db.transaction(() => {
    blockIds.forEach((id, index) => update.run(index, id, dailyScheduleId))
    db.prepare("UPDATE daily_schedules SET status = 'draft' WHERE id = ?").run(dailyScheduleId)
  })
  tx()
}

function addSeconds(hms: string, seconds: number): string {
  const [h, m, s] = hms.split(':').map(Number)
  let total = h * 3600 + m * 60 + s + seconds
  total = Math.max(0, Math.round(total))
  const hh = Math.floor(total / 3600) % 24
  const mm = Math.floor((total % 3600) / 60)
  const ss = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`
}

/** Computes sequential start times from 00:00:00 based on each block's media duration, and marks the day published. Requires at least one block. */
export function publishSchedule(db: Database.Database, dailyScheduleId: number): DailySchedule {
  const blocks = listBlocksWithMedia(db, dailyScheduleId)
  if (blocks.length === 0) {
    throw new Error('Cannot publish a schedule with no items')
  }

  const update = db.prepare('UPDATE schedule_blocks SET start_time = ? WHERE id = ?')
  const tx = db.transaction(() => {
    let cursor = '00:00:00'
    for (const block of blocks) {
      update.run(cursor, block.id)
      cursor = addSeconds(cursor, Math.round((block.media.durationMs ?? 0) / 1000))
    }
    db.prepare("UPDATE daily_schedules SET status = 'published' WHERE id = ?").run(dailyScheduleId)
  })
  tx()

  const row = db.prepare('SELECT * FROM daily_schedules WHERE id = ?').get(
    dailyScheduleId
  ) as DailyScheduleRow
  return rowToSchedule(row)
}
