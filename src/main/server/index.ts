import express from 'express'
import cors from 'cors'
import { createServer, type Server as HttpServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import type Database from 'better-sqlite3'
import { healthRouter } from './routes/health'
import { mediaRouter } from './routes/media'
import { scheduleRouter } from './routes/schedule'
import { playoutRouter } from './routes/playout'
import { getThumbnailsDir, getFilesDir, getHlsDir, getRecordingsDir } from '../library/paths'
import { PlayoutController } from '../playout/controller'
import { Recorder } from '../playout/recorder'
import { recordingRouter } from './routes/recording'

export interface CommunityCastServer {
  http: HttpServer
  io: SocketIOServer
  port: number
  playoutController: PlayoutController
  recorder: Recorder
  close: () => Promise<void>
}

// Bound to 0.0.0.0 (all interfaces) — reachable from other devices on the
// home network (192.x), not just this machine. THIS IS A DELIBERATE,
// EXPLICITLY REQUESTED TRADEOFF, NOT A DEFAULT: this API has zero
// authentication. Anyone who can reach this port — any device on the same
// Wi-Fi, not just the person running it — can import/delete media, rewrite
// the schedule, and start/stop the stream. If you're reading this because
// you cloned the project rather than made this choice yourself, you
// probably want 127.0.0.1 instead. See README "Local network access" for
// the actual reasoning and how to add authentication if you want LAN access
// without the wide-open tradeoff.
const HOST = '0.0.0.0'
const DEFAULT_PORT = 47811

export function startServer(db: Database.Database): CommunityCastServer {
  const expressApp = express()

  // The renderer is served from a Vite dev origin in development and from
  // a file:// origin in production. Since the server is loopback-only,
  // reflecting the request origin here is a reasonable MVP tradeoff rather
  // than a real cross-host exposure risk.
  expressApp.use(cors({ origin: true, credentials: true }))
  expressApp.use(express.json())

  const httpServer = createServer(expressApp)
  const io = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true }
  })

  const playoutController = new PlayoutController(db, io)
  const recorder = new Recorder()

  expressApp.locals.db = db
  expressApp.locals.io = io
  expressApp.locals.playoutController = playoutController
  expressApp.locals.recorder = recorder
  expressApp.use('/api/health', healthRouter)
  expressApp.use('/api/media', mediaRouter)
  expressApp.use('/api/schedule', scheduleRouter)
  expressApp.use('/api/playout', playoutRouter)
  expressApp.use('/api/recording', recordingRouter)
  expressApp.use('/media/thumbnails', express.static(getThumbnailsDir()))
  expressApp.use('/media/files', express.static(getFilesDir()))
  expressApp.use(
    '/hls',
    express.static(getHlsDir(), {
      setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') // playlist/segments change constantly while live
    })
  )
  expressApp.use('/recordings', express.static(getRecordingsDir()))

  io.on('connection', (socket) => {
    console.log(`[server] renderer connected: ${socket.id}`)
    // Bring a newly-connected renderer up to date immediately rather than
    // making it wait for the next engine tick.
    socket.emit('playout:tick', playoutController.getStatus())
    socket.on('disconnect', () => console.log(`[server] renderer disconnected: ${socket.id}`))
  })

  const port = DEFAULT_PORT
  httpServer.listen(port, HOST, () => {
    console.log(`[server] listening on http://${HOST}:${port}`)
  })

  return {
    http: httpServer,
    io,
    port,
    playoutController,
    recorder,
    close: () =>
      new Promise((resolve) => {
        playoutController.stop()
        recorder.stop()
        io.close()
        httpServer.close(() => resolve())
      })
  }
}
