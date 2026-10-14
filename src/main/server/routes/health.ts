import { Router } from 'express'
import type Database from 'better-sqlite3'
import { app } from 'electron'
import { getDbPath } from '../../db'
import { getLanIp } from '../networkInfo'
import type { HealthResponse } from '@shared/types'

export const healthRouter = Router()

healthRouter.get('/', (req, res) => {
  const db = req.app.locals.db as Database.Database

  // Trivial round-trip query — if the DB failed to open or migrate, this throws
  // and the renderer's connection check will correctly show "not connected"
  // rather than a false-positive "ok".
  db.prepare('SELECT COUNT(*) as count FROM settings').get()

  const response: HealthResponse = {
    ok: true,
    version: app.getVersion(),
    dbPath: getDbPath(),
    lanIp: getLanIp()
  }
  res.json(response)
})
