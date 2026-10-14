import express from 'express'
import cors from 'cors'
import { createServer, type Server as HttpServer } from 'http'
import { join } from 'path'
import { existsSync } from 'fs'
import { getHlsDir } from '../library/paths'

// Deliberately bound to 0.0.0.0 (all interfaces), unlike the main control
// server which is loopback-only — this is the one piece of CommunityCast
// that's actually meant to be reachable from outside your Mac (via router
// port-forwarding + DuckDNS) so the stream can be embedded on a website.
//
// This is safe to expose specifically BECAUSE it does nothing else: no
// media library, no scheduler, no playout control, no way to change
// anything — just read-only static files (the HLS output and a simple
// public website). The main server (port 47811) has all of that and must
// never be exposed; this one exists so you never have to make that
// tradeoff.
const HOST = '0.0.0.0'
const DEFAULT_PORT = 8088

export interface PublicStreamServer {
  http: HttpServer
  port: number
  close: () => Promise<void>
}

export function startPublicStreamServer(): PublicStreamServer {
  const app = express()

  // Any origin needs to be able to embed this — that's the point of putting
  // it on a website. There's nothing sensitive being served, so an
  // unrestricted CORS policy here isn't the same risk it would be on the
  // control API.
  app.use(cors({ origin: true }))

  app.use(
    '/hls',
    express.static(getHlsDir(), {
      setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
    })
  )

  // A simple public website with the live player — see public-site/index.html
  // to rebrand it (station name, tagline, about text are marked with EDIT
  // comments). Once DuckDNS + port-forwarding are set up, this port's URL
  // *is* the website, video included — no separate hosting needed. The HTML
  // file is also fully portable if you'd rather host it elsewhere: just
  // change STREAM_URL in its <script> from a relative path to your full
  // DuckDNS URL.
  //
  // In dev (electron-vite dev), this file lives under src/main/server/public-site.
  // In a packaged build, main is bundled to a single out/main/index.js, so
  // __dirname there is out/main/ — both paths are checked.
  const publicSiteCandidates = [
    join(__dirname, 'public-site'),
    join(__dirname, '../../src/main/server/public-site')
  ]
  const publicSiteDir = publicSiteCandidates.find((p) => existsSync(p))
  if (publicSiteDir) {
    app.use(express.static(publicSiteDir))
  } else {
    console.warn('[public-stream] public-site directory not found, serving video only')
  }

  const httpServer = createServer(app)
  const port = DEFAULT_PORT
  httpServer.listen(port, HOST, () => {
    console.log(`[public-stream] listening on http://${HOST}:${port} (external-facing)`)
  })

  return {
    http: httpServer,
    port,
    close: () => new Promise((resolve) => httpServer.close(() => resolve()))
  }
}
