import { Router } from 'express'
import type { StartPlayoutRequest } from '@shared/types'
import type { PlayoutController } from '../../playout/controller'

export const playoutRouter = Router()

playoutRouter.get('/state', (req, res) => {
  const controller = req.app.locals.playoutController as PlayoutController
  res.json(controller.getStatus())
})

playoutRouter.get('/log', (req, res) => {
  const controller = req.app.locals.playoutController as PlayoutController
  res.json({ lines: controller.getStreamLog() })
})

playoutRouter.post('/start', (req, res) => {
  const controller = req.app.locals.playoutController as PlayoutController
  const body = (req.body ?? {}) as Partial<StartPlayoutRequest>

  if (typeof body.date !== 'string') {
    return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' })
  }

  try {
    const status = controller.start(body.date, body.rtmpUrl)
    res.json(status)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

playoutRouter.post('/stop', (req, res) => {
  const controller = req.app.locals.playoutController as PlayoutController
  res.json(controller.stop())
})
