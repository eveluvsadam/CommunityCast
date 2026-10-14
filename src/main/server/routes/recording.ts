import { Router } from 'express'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { StartRecordingRequest, RecordingFile } from '@shared/types'
import type { Recorder } from '../../playout/recorder'
import type { PlayoutController } from '../../playout/controller'
import { getRecordingsDir } from '../../library/paths'

export const recordingRouter = Router()

recordingRouter.get('/status', (req, res) => {
  const recorder = req.app.locals.recorder as Recorder
  res.json(recorder.getStatus())
})

recordingRouter.get('/log', (req, res) => {
  const recorder = req.app.locals.recorder as Recorder
  res.json({ lines: recorder.getRecentLog() })
})

recordingRouter.get('/list', (_req, res) => {
  const dir = getRecordingsDir()
  const files: RecordingFile[] = readdirSync(dir)
    .filter((f) => f.endsWith('.mp4'))
    .map((filename) => {
      const stat = statSync(join(dir, filename))
      return { filename, sizeBytes: stat.size, createdAt: stat.birthtime.toISOString() }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  res.json({ files })
})

recordingRouter.post('/start', (req, res) => {
  const recorder = req.app.locals.recorder as Recorder
  const playoutController = req.app.locals.playoutController as PlayoutController
  const body = (req.body ?? {}) as Partial<StartRecordingRequest>

  // No default falls back to the local HLS URL — recording needs an rtmp://
  // source (see recorder.ts for why). If already pushing to an external
  // destination, default to recording that same feed; otherwise the caller
  // must supply an RTMP URL (e.g. a local `npm run rtmp:test-server` relay).
  const sourceUrl = body.sourceUrl?.trim() || playoutController.getStatus().rtmpUrl

  if (!sourceUrl) {
    return res.status(400).json({
      error:
        'No source URL given and no external RTMP destination is currently configured. Provide an rtmp:// source — e.g. a local relay from `npm run rtmp:test-server`.'
    })
  }
  if (!sourceUrl.startsWith('rtmp://')) {
    return res.status(400).json({
      error: 'Recording requires an rtmp:// source URL (not http/hls) — see README for why.'
    })
  }

  try {
    res.json(recorder.start(sourceUrl))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

recordingRouter.post('/stop', (req, res) => {
  const recorder = req.app.locals.recorder as Recorder
  res.json(recorder.stop())
})
