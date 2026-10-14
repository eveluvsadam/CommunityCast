import { Router } from 'express'
import type Database from 'better-sqlite3'
import type { Server as SocketIOServer } from 'socket.io'
import type { ImportMediaRequest, ImportMediaResponse, MediaType } from '@shared/types'
import { listMediaItems } from '../../db/mediaRepo'
import { importMediaFiles, removeMediaItem } from '../../library/importService'

const VALID_MEDIA_TYPES: MediaType[] = ['program', 'commercial', 'promo', 'announcement', 'bumper']

export const mediaRouter = Router()

mediaRouter.get('/', (req, res) => {
  const db = req.app.locals.db as Database.Database
  res.json({ items: listMediaItems(db) })
})

mediaRouter.post('/import', async (req, res) => {
  const db = req.app.locals.db as Database.Database
  const io = req.app.locals.io as SocketIOServer
  const body = (req.body ?? {}) as Partial<ImportMediaRequest>

  if (!Array.isArray(body.filePaths) || body.filePaths.length === 0) {
    return res.status(400).json({ error: 'filePaths must be a non-empty array' })
  }
  if (!body.mediaType || !VALID_MEDIA_TYPES.includes(body.mediaType)) {
    return res
      .status(400)
      .json({ error: `mediaType must be one of: ${VALID_MEDIA_TYPES.join(', ')}` })
  }

  const results = await importMediaFiles(db, body.filePaths, body.mediaType, (progress) =>
    io.emit('media:import-progress', progress)
  )
  const response: ImportMediaResponse = { results }
  res.json(response)
})

mediaRouter.delete('/:id', async (req, res) => {
  const db = req.app.locals.db as Database.Database
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'id must be an integer' })
  }

  const removed = await removeMediaItem(db, id)
  if (!removed) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})
