// Local RTMP receiver — usable both for local testing (no external account
// needed) and, if you choose to expose it, as your actual public-facing
// ingest/distribution point, and as an RTMP source for the Recording
// feature (see recorder.ts for why recording specifically needs an RTMP
// source rather than the app's own local HLS URL). Not part of the shipped
// app itself.
//
// SECURITY: publishing is protected by a stream key (the same pattern
// YouTube/Twitch use — a secret path segment, not a public one). Without
// this, anyone who discovers your RTMP URL could publish garbage over your
// channel, not just watch it. Viewers need the full URL including the key;
// don't post it publicly any more than you'd post a YouTube stream key.
//
// This is a plain RTMP relay only — an earlier version also transcoded to
// HLS via node-media-server's built-in `trans` feature, but that turned out
// to be unreliable during testing (an internal bug that crashed a log line,
// and — separately — segments that never actually got written). CommunityCast
// now produces its own local HLS directly (see src/main/playout/streamer.ts),
// so this script doesn't need to duplicate that.
//
// Run alongside the app:  npm run rtmp:test-server
// Then in CommunityCast's Live Preview, set the RTMP URL to the ingest URL
// printed below, and click "Go Live".
//
// This is a CommonJS script (.cjs) because node-media-server is a CJS
// package and the rest of this project is set to "type": "module".

const crypto = require('crypto')
const NodeMediaServer = require('node-media-server')

// Defensive: during development this process occasionally died silently under
// heavy concurrent load with no error output. These handlers make failures
// visible (and non-fatal where possible) instead of the server just vanishing.
process.on('uncaughtException', (err) => {
  console.error('[rtmp-test-server] uncaught exception (server continues):', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[rtmp-test-server] unhandled rejection (server continues):', reason)
})

// STREAM_KEY env var lets you pin a fixed key (e.g. for a DDNS setup where
// you want the URL to stay stable across restarts). Otherwise a random one
// is generated each run — fine for quick local testing.
const STREAM_KEY = process.env.STREAM_KEY || crypto.randomBytes(12).toString('hex')
const APP_NAME = 'live'

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*'
  },
  logType: 3
}

const nms = new NodeMediaServer(config)

nms.on('prePublish', (id, streamPath) => {
  const expected = `/${APP_NAME}/${STREAM_KEY}`
  if (streamPath !== expected) {
    console.warn(`[rtmp-test-server] REJECTED publish attempt to ${streamPath} (wrong/missing stream key)`)
    const session = nms.getSession(id)
    session.reject()
    return
  }
  console.log(`[rtmp-test-server] incoming stream: ${streamPath} (session ${id})`)
})

nms.on('donePublish', (id, streamPath) => {
  console.log(`[rtmp-test-server] stream ended: ${streamPath} (session ${id})`)
})

nms.run()

console.log('')
console.log('CommunityCast local RTMP receiver running.')
console.log('')
console.log(`  Use this URL for Go Live's RTMP field, and/or Recording's source field:`)
console.log(`    rtmp://127.0.0.1:1935/${APP_NAME}/${STREAM_KEY}`)
console.log('')
console.log('  Watch it in VLC: Media > Open Network Stream > paste that same URL.')
console.log('')
console.log('  Treat that URL like a password — anyone who has it can publish')
console.log('  to (or watch) your channel. Set STREAM_KEY=yourkey to pin a fixed')
console.log('  one instead of a fresh random key every run.')
console.log('')
