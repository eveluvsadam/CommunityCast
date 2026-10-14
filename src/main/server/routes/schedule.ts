import { Router } from 'express'
import type Database from 'better-sqlite3'
import type { AddBlockRequest, ReorderBlocksRequest, ScheduleResponse } from '@shared/types'
import {
  getOrCreateDailySchedule,
  listBlocksWithMedia,
  addBlock,
  removeBlock,
  reorderBlocks,
  publishSchedule
} from '../../db/scheduleRepo'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const scheduleRouter = Router()

function loadSchedule(db: Database.Database, date: string): ScheduleResponse {
  const schedule = getOrCreateDailySchedule(db, date)
  const blocks = listBlocksWithMedia(db, schedule.id)
  return { schedule, blocks }
}

scheduleRouter.get('/:date', (req, res) => {
  const db = req.app.locals.db as Database.Database
  if (!DATE_RE.test(req.params.date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  }
  res.json(loadSchedule(db, req.params.date))
})

scheduleRouter.post('/:date/blocks', (req, res) => {
  const db = req.app.locals.db as Database.Database
  const body = (req.body ?? {}) as Partial<AddBlockRequest>
  if (!DATE_RE.test(req.params.date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  }
  if (typeof body.mediaItemId !== 'number') {
    return res.status(400).json({ error: 'mediaItemId is required' })
  }

  const schedule = getOrCreateDailySchedule(db, req.params.date)
  addBlock(db, schedule.id, body.mediaItemId)
  res.json(loadSchedule(db, req.params.date))
})

scheduleRouter.delete('/:date/blocks/:blockId', (req, res) => {
  const db = req.app.locals.db as Database.Database
  removeBlock(db, Number(req.params.blockId))
  res.json(loadSchedule(db, req.params.date))
})

scheduleRouter.put('/:date/blocks/reorder', (req, res) => {
  const db = req.app.locals.db as Database.Database
  const body = (req.body ?? {}) as Partial<ReorderBlocksRequest>
  if (!Array.isArray(body.blockIds)) {
    return res.status(400).json({ error: 'blockIds must be an array' })
  }

  const schedule = getOrCreateDailySchedule(db, req.params.date)
  reorderBlocks(db, schedule.id, body.blockIds)
  res.json(loadSchedule(db, req.params.date))
})

scheduleRouter.post('/:date/publish', (req, res) => {
  const db = req.app.locals.db as Database.Database
  const schedule = getOrCreateDailySchedule(db, req.params.date)
  try {
    publishSchedule(db, schedule.id)
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message })
  }
  res.json(loadSchedule(db, req.params.date))
})
