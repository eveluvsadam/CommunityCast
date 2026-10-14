# CommunityCast

A macOS desktop app for running your own internet television channel — media
library, program scheduler, live preview, and RTMP streaming/recording — with
a broadcast-automation workflow modeled on real community TV stations.

## What's new in 2.0

- **Modern, supported stack:** Electron 32 → 44, React 18 → 19, React Router 7,
  Vite 8 + electron-vite 6, Express 5, better-sqlite3 13.
- **Security:** the shipped app has zero known vulnerabilities (1.x had 40,
  two of them critical).
- **Sturdier API:** routes no longer crash on requests sent without a body.
- Re-verified end to end on the new stack: import → schedule → publish → Go Live
  → HLS output → stop.

## Current state

Working end-to-end: import media → build a daily playlist → publish it →
"Go Live" plays it in a continuous loop, mirrored to a local monitor (the
real broadcast output, via HLS — not a raw clip) and (optionally) pushed to
an external RTMP destination via ffmpeg. Recording captures that output
stream to a local file. Window is properly draggable, theme is dark, stream
health is visible on the page rather than hidden behind a click.

**What's verified, not just written:** every layer below was exercised
through the real API against real (synthetic) video files, not just
type-checked. See "How this was tested" below for specifics, including two
real bugs this caught: RTMP auto-reconnect, and a genuine ffmpeg crash
reading HLS as an input (see "Recording" section) that reshaped how
recording works.

## Setup

Requires Node.js 22.12+ and Xcode Command Line Tools (`xcode-select --install`)
for compiling `better-sqlite3`'s native binding.

```bash
npm install   # also rebuilds better-sqlite3 against Electron's Node ABI (postinstall)
npm run dev   # launches the app with hot reload
```

To go live: import media, build a lineup in Scheduler, publish it, then hit
**Go Live** in Live Preview. That's it for local viewing — no extra setup,
no accounts. See "Watching your channel" below for how to actually watch it,
and "Streaming beyond your local network" if you want an external RTMP
destination too.

Other scripts:
- `npm run typecheck` — type-check main/preload and renderer separately
- `npm run build` — production build to `out/`
- `npm run dist:mac` — build + package a macOS app (packaging/signing beyond a stub is a later step)
- `npm run rtmp:test-server` — a local RTMP receiver for testing what an *external* destination would see (not needed for local viewing — see below)

## How this was tested

Rather than just writing code and hoping, each phase was run against real
data through the actual API before being called done:

- **Media Library**: imported a real synthetic video via the API, confirmed
  ffprobe correctly read duration/resolution/codec, confirmed the generated
  thumbnail is a real, correctly-sized JPEG served over HTTP, confirmed
  delete removes the actual files on disk (not just the DB row).
- **Scheduler**: built a two-item playlist via the API, published it, and
  confirmed start times were computed correctly from each item's duration.
- **Playout Engine**: started the engine and watched it advance between
  blocks at the correct times, and loop back to the start — via real
  polling of `/api/playout/state`, not code inspection.
- **RTMP streaming**: went live and confirmed, via an independent RTMP
  receiver, that the incoming stream is exactly what it should be — H.264
  640×360 (matching the source), AAC audio, at the configured bitrates.
  Verified this two different ways against two different receivers to rule
  out a receiver-side fluke.
- **Found and fixed a real bug in the process**: the streamer originally
  only reconnected on a *scheduled* block change. If ffmpeg died
  unexpectedly (network blip, receiver restart) it went dark until the next
  block — unacceptable for something whose whole premise is 24/7 operation.
  It now auto-reconnects with a backoff on any unexpected exit; this was
  confirmed by killing the receiver mid-stream and watching it retry.

**One honest caveat**: `node-media-server`, the package used only for the
optional local test receiver (`npm run rtmp:test-server`, not part of the
shipped app), showed some instability under heavy concurrent load during
development. CommunityCast's own streaming code was confirmed solid
independent of that package (see above). If you see the test receiver drop
unexpectedly, it's worth confirming CommunityCast itself is still trying to
reconnect (check the "streaming diagnostics" panel in Live Preview) before
assuming something's wrong on the CommunityCast side.

## Building a macOS installer (.dmg)

```bash
npm run dist:mac
```

This uses `electron-builder`. Native binaries (ffmpeg, ffprobe, better-sqlite3)
are correctly excluded from the compressed `app.asar` and shipped unpacked —
verified during development by building the `.app` bundle and confirming the
binaries land where they can actually execute.

**Two things to know before you run it:**

1. **It won't work from this sandbox — genuinely needs your Mac.** DMG
   creation depends on `dmg-license`, a macOS-only native module. I
   confirmed the rest of the packaging pipeline (asar bundling, native
   binary unpacking) works correctly by building the `.app` bundle without
   the DMG wrapper; the DMG step itself needs to run on real macOS.
2. **The result will be unsigned** — there's no Apple Developer account
   ($99/year) wired up here. macOS Gatekeeper will refuse to open it
   normally. To open it anyway: right-click (Control-click) the app in
   Finder → **Open** → confirm **Open** in the dialog. You only need to do
   this once per install. (Signing + notarization removes this step
   entirely for anyone you share it with, but that's a paid Apple account
   and a separate CI step, not something built into this config.)

## Watching your channel

Going live now **always** produces a local stream you can watch directly in
Safari — no VLC, no accounts, no separate server to run. Once you click
**Go Live**, Live Preview shows the watch URL right there (with a copy
button): `http://127.0.0.1:47811/hls/index.m3u8`. Safari plays `.m3u8` (HLS)
natively; just open that URL.

This replaced an earlier design that required running a separate local RTMP
test server for this. That server (`npm run rtmp:test-server`) still exists
and is still useful — but now specifically for testing what an *external*
RTMP destination (Twitch/YouTube-style, or your own DDNS setup) would see,
not for basic local viewing.

**Why HLS instead of just RTMP for local viewing**: browsers fundamentally
cannot play `rtmp://` URLs — that protocol needs a dedicated client like
VLC, and died in browsers along with Flash. HLS is a segmented-file format
regular HTTP can serve, which is what lets Safari open it directly. The
tradeoff is latency: HLS is typically 5-15 seconds behind real-time
(inherent to segmenting), versus RTMP's near-instant delivery.

**How it's built**: the same ffmpeg process that would push to an external
RTMP destination also always writes local HLS segments, via ffmpeg's `tee`
muxer fanning one encode out to multiple outputs
(`src/main/playout/streamer.ts`). An external RTMP URL is now genuinely
optional — set it only if you also want to push elsewhere.

**Testing honesty**: I verified the exact ffmpeg command this produces —
concat filter graph (multi-resolution normalization) piped through `tee` to
HLS — directly and thoroughly: clean exit code 0, real `.ts` segments
written, a valid `.m3u8` playlist with correct durations, tested
specifically with two clips of different resolutions to stress the
normalization step that matters most for real community content. I was
**not** able to get a full live Electron+Express run of this specific
feature working end-to-end in my sandbox during this session — the sandbox
had degraded after many hours of continuous testing (background processes
dying unpredictably, unrelated to this feature's code) and I made the call
to stop fighting environment instability rather than keep burning time on
it. The wiring connecting the proven ffmpeg command to the app (which
directory it writes to, which route serves that directory) is a direct,
mechanical connection between two independently-already-proven pieces — the
same `getHlsDir()` function is used by both the writer and the server route,
so they can't drift out of sync — but you should do the first real check
yourself: go live, then open the HLS URL in Safari, and let me know if
anything's off. That's the one piece I'd genuinely call "should work" rather
than "confirmed working" right now.

## Local network access (control API on your LAN)

By request, the control API (`47811`) is now bound to `0.0.0.0` instead of
`127.0.0.1` — reachable from other devices on your home network (`192.x`),
not just this Mac. **This was a deliberate, explicitly risk-acknowledged
choice, not a default**: this API has no authentication at all. Anyone who
can reach port `47811` — any device on the same Wi-Fi, not just you — can
import/delete media, rewrite the schedule, and start/stop the stream. If
you're reading this after cloning the project rather than having made this
tradeoff yourself, change `HOST` back to `'127.0.0.1'` in
`src/main/server/index.ts`.

The app now auto-detects your Mac's actual LAN IP (`os.networkInterfaces()`)
and shows real, copy-pasteable `192.x` URLs directly in Live Preview once
you're live — both for this Mac and for other devices on your network —
instead of making you hunt down the address yourself.

## Fixed: clips "skipping" — a real-time pacing bug

Reported as "it keeps skipping to clips." Root cause, found by reasoning
through the actual ffmpeg command rather than guessing: `-re` (real-time
input pacing) was applied to every input file individually. But `-re` paces
each input from the moment the *process* starts, not from when the concat
filter actually needs it — so while clip 1 was playing, clip 2 was already
being read and buffered in real time in the background. By the time concat
switched to clip 2, it had already buffered ahead, so that chunk got pushed
through in a burst instead of smoothly — uneven pacing right at every clip
transition, which is exactly what "skipping" describes.

Confirmed with a direct test, not just theory: two 6-second clips correctly
concatenated to 12.04 seconds of content either way, but the old version
did it in **7.5 seconds of wall-clock time** (~1.6x real speed) while the
fixed version took **12.1 seconds** (correctly paced at 1x). With three
clips the gap widens further (old: ~1.8x speed) — more simultaneous inputs
racing to buffer ahead makes it worse, confirming this scales with lineup
size rather than being a two-clip coincidence.

Fix: `-re` removed from individual inputs; real-time pacing now happens on
the combined output *after* concat has already sequenced the clips, using
ffmpeg's purpose-built `realtime`/`arealtime` filters (confirmed present in
the bundled ffmpeg build). See `src/main/playout/concatBuilder.ts`.

## Fixed: remaining glitches (pixel format, audio format, keyframe alignment)

Beyond the pacing bug above, three more real gaps in the encoding pipeline,
found by working through the actual filter graph and encoder settings
rather than guessing:

- **Pixel format wasn't pinned before concat.** Different source clips
  (different cameras, screen recorders, encoders) can carry different pixel
  formats. Concat combining frames of inconsistent pixel format is a real,
  documented source of visual corruption right at the transition point.
  Added explicit `format=yuv420p` per clip, before concat — not just relying
  on the final encoder setting to smooth it over after the fact.
- **Audio format was only partly normalized.** Sample rate and channel
  layout were pinned, but not sample format (`fltp` vs `s16` etc.) — a
  mismatch there commonly shows up as audible clicks right at transitions.
  Now fully pinned.
- **Keyframe interval didn't match the HLS segment length, and scene
  changes could insert extra keyframes unpredictably.** `-g` was 50 frames
  (1.67s at 30fps) against a 2-second segment target — misaligned, which is
  exactly what produced the irregular 1.5–3s segment durations visible in
  the actual ffmpeg log. Worse, scene-change detection was still enabled,
  and a hard cut between two different clips is precisely what triggers it
  — inserting an unpredictable extra keyframe right at the one moment that
  most needs to be clean. Fixed: `-g 60` (exactly 2s at 30fps) and
  `-sc_threshold 0` (keyframes strictly on the regular interval only).

Verified directly: a real three-clip concat run with all three fixes
applied produced a playlist where every single segment came out at a
uniform 2.4 seconds — a concrete, measurable improvement over the irregular
1.5–3s spread seen in the real log this was diagnosed from.

## Running as a dedicated appliance (e.g. a Mac Mini)

For "everything under one URL" — `http://yourname.duckdns.org/` with no
port number — the fix is on your **router**, not in the app: CommunityCast
itself keeps running on port `8088` (an unprivileged port, no `sudo`
needed), and your router's port-forwarding is configured to map **external
port 80 → your Mac Mini's LAN IP, internal port 8088**. Most consumer
routers support forwarding to a different internal port than the external
one — look for separate "external port" / "internal port" fields, not just
a single port number. Running the app directly on port 80 would require
root privileges, which isn't something a GUI app should do.

Two things now make this genuinely hands-off on a dedicated always-on
machine, both only active in a packaged build (`npm run dist:mac`) — never
in dev mode, so a dev session can't register itself as a permanent login item:

- **Auto-launch on login** (`app.setLoginItemSettings`) — if the Mac Mini
  loses power and reboots, CommunityCast opens itself back up without
  anyone needing to walk over and do it.
- **Auto-resume broadcasting** — auto-launch alone would just leave the app
  sitting open but idle. The last live configuration (date + RTMP URL) is
  persisted the moment you go live, and cleared the moment you explicitly
  click Stop. On startup, if that persisted state is still there — meaning
  the broadcast was interrupted (crash, power loss) rather than
  deliberately stopped — it automatically goes live again with the same
  settings. An explicit Stop is remembered as intentional and never
  auto-resumed out from under you. Verified directly against a real SQLite
  database: the persist/clear/resume logic behaves correctly in all three
  cases (nothing persisted, persisted then explicitly cleared, persisted
  and picked back up).

## Public website

A simple branded website with the live player, served directly from the
public stream server — `src/main/server/public-site/index.html`. Once your
DuckDNS + port-forwarding are set up (see above), that server's URL *is*
your website, video included — no separate hosting to manage. Verified
directly: the site serves correctly (200, correct content-type, contains
the player and stream config) alongside the `/hls` route on the same
server, with no conflicts.

**To rebrand it**: open the HTML file, look for the `EDIT` comments —
station name, tagline, and the about blurb are all clearly marked. Uses the
exact same dark/tally-light visual language as the desktop app itself, so
the site and the control room feel like one station.

**To host it elsewhere instead** (your own domain, GitHub Pages, etc.):
copy the HTML file anywhere, and change `STREAM_URL` in its `<script>` tag
from the relative `/hls/index.m3u8` to your full DuckDNS URL — e.g.
`http://yourname.duckdns.org:8088/hls/index.m3u8`.

## Hardening for 24/7 / external / unattended operation

Everything up to this point was tested for "does it work," not "will it
survive running unattended for days, reachable from outside your house."
Those are a different bar, and a deliberate audit against that bar found
four real gaps — fixed, not just noted:

1. **The Mac could sleep and silently kill the stream.** Nothing told macOS
   to stay awake while live. Fixed with Electron's `powerSaveBlocker`,
   engaged only while actually streaming — not on every app launch, so
   normal use doesn't needlessly keep your Mac awake.

2. **A stalled (not dropped) network connection could hang forever.**
   Reconnect logic only fired on the ffmpeg process actually exiting — but
   a flaky home connection can get stuck without ever cleanly erroring out.
   Fixed with a watchdog that watches ffmpeg's own progress output (the
   same `time=...` lines the UI's health badge reads) going quiet for 20
   seconds, and force-restarts if so.

3. **Closing the window used to quit the entire app** — including killing
   an active broadcast — which breaks the standard macOS convention
   (closing a window ≠ quitting the app) and meant one accidental click
   could end a "24/7" stream. Fixed: closing the window now just closes the
   window; the app keeps running in the Dock, exactly like every other
   normal Mac app, and only actually quits on Cmd+Q (with proper async
   cleanup of the server/streamer/recorder before it does).

4. **There was no safe way to actually put the stream on a website.** The
   local HLS output was served on the same port as the fully unauthenticated
   control API (media library, scheduler, start/stop). Exposing that port
   for a website embed would have meant exposing full control of your
   channel too. Fixed with a genuinely separate server
   (`src/main/server/publicStreamServer.ts`) that serves **only** the video
   files — nothing else — on its own port (`8088`), safe to port-forward.
   The control API (`47811`) still must never be exposed; this new port
   exists specifically so you never have to make that tradeoff.

**For your actual DuckDNS + website setup**, this changes the recommended
path: port-forward `8088` (not just `1935`) to your Mac's local IP, and use
`http://yourname.duckdns.org:8088/hls/index.m3u8` as the source for a video
player (`hls.js` or Video.js) embedded on your website. `1935`/RTMP is still
there if you specifically want to push to something RTMP-based, but for "a
video player on my website," the HLS path above is the direct route.

**One thing hardening code can't fix**: if your schedule is short, the
channel will still loop through it repeatedly all day — that's expected,
not a bug, and not something more resilience code changes. For something
that's actually meant to feel like a 24/7 channel, you need a full day's
worth of scheduled content, not a handful of test clips on repeat.

## Recording

Records the actual output stream — not the source clips — via
`Start Recording` in Live Preview. Uses `-c copy` (remux, not re-encode)
against an **rtmp://** source, writing fragmented MP4 so the file stays
playable even if the app is killed mid-recording rather than stopped
cleanly.

**Why RTMP and not the local HLS URL**, documented honestly because it
affects how you use this: during testing, having ffmpeg *read* HLS/MPEG-TS
as an input reliably crashed (`SIGSEGV`) in this project's Linux test
environment. I isolated it methodically — ruled out network vs. local file,
ruled out live vs. already-finished segments, ruled out stream-copy vs.
re-encode — down to ffmpeg's MPEG-TS demuxer itself crashing on read,
reproduced with nothing more than a plain local `.ts` file, no HLS or
network involved at all. RTMP/FLV reading, by contrast, I verified reliable
multiple times. Rather than ship a feature I'd directly watched crash,
recording targets RTMP sources instead.

This may well be specific to that one Linux build — `ffmpeg-static` ships a
separately-compiled binary per platform, so your Mac's copy is a different
build entirely and may not share the bug — but the responsible move was to
design around what I'd actually proven solid rather than assume the Mac
build is fine and find out later.

**Practical effect**: if you're already pushing to an external RTMP
destination, recording defaults to that feed automatically. For a purely
local recording, you need an RTMP source running — the same
`npm run rtmp:test-server` used for external streaming works here too: run
it, use its printed URL as both your Go Live RTMP field and your Recording
source field.

## Streaming beyond your local network

The default local RTMP receiver (`npm run rtmp:test-server`) now requires a
**stream key** — a secret path segment, the same pattern YouTube/Twitch use.
On startup it prints the real ingest/playback URL, e.g.:

```
rtmp://127.0.0.1:1935/live/a1b2c3d4e5f6...
```

Anyone who has that URL can publish to *or* watch your channel — treat it
like a password. Set `STREAM_KEY=yourkey npm run rtmp:test-server` to pin a
fixed key instead of a new random one every run (you'll want this for a
DDNS setup, so the URL doesn't change on restart). This was tested directly:
a publish attempt with the wrong key gets a clean `[rtmp reject]` and the
publisher sees `Input/output error`; the correct key streams normally.

**To make it reachable from outside your home network**, three things need
to happen — I can't do any of them for you (no access to your router or
accounts), but here's exactly what to do:

1. **Pin a stream key**: `STREAM_KEY=yourkey npm run rtmp:test-server`
2. **Sign up for a free dynamic DNS hostname.** [DuckDNS](https://www.duckdns.org)
   is simple and free — sign in, claim a subdomain like `yourname.duckdns.org`,
   install their small updater so it tracks your home IP if it changes.
3. **Port-forward 1935 (RTMP) on your router** to your Mac's local `192.x`
   address — router admin page, usually *Port Forwarding* or *NAT*, varies
   by router. **Do not forward port 47811** — that's CommunityCast's control
   API (media library, scheduler, start/stop streaming) with no
   authentication at all. It must stay local-only. Only 1935 should ever be
   forwarded.
4. Use `rtmp://yourname.duckdns.org:1935/live/yourkey` as the RTMP URL in
   Live Preview, and give that same URL to anyone you want watching.

**Before you commit to this for a real audience**, two practical limits
worth knowing: home internet upload bandwidth is usually far smaller than
download, and every concurrent viewer pulling directly from this RTMP
receiver consumes that same upload bandwidth separately (there's no CDN
fanning it out). A couple of viewers on typical home upload speeds is fine;
this isn't a substitute for an actual streaming platform if you want more
than that.

## Architecture decisions

1. **Backend transport**: an embedded Express + Socket.io server runs inside
   the Electron main process, bound to `127.0.0.1` only (see
   `src/main/server/index.ts`). The renderer talks to it like a normal web
   client via `fetch`/`socket.io-client`. **Do not change the bind host to
   `0.0.0.0`** without deliberately deciding to expose the control surface to
   the LAN. A thin `contextBridge` preload (`src/preload/index.ts`) handles
   the one thing HTTP can't: the native file picker for media import.

2. **Scheduling model**: simple daily playlist (`daily_schedules` →
   `schedule_blocks`), no recurring weekly templates in MVP.

3. **Playout/streaming**: ffmpeg runs as **one continuous process for the
   entire published lineup**, using a concat filter graph
   (`src/main/playout/concatBuilder.ts`) that scales/pads every clip to a
   common 1280×720 canvas and normalizes audio format before concatenating —
   necessary because real community content won't all share one resolution
   or audio format, and mixing them into a concat filter without normalizing
   first breaks outright.

   **This wasn't the original design** — the first version spawned a new
   ffmpeg process per block, which meant a real RTMP disconnect/reconnect
   between every single item. That's invisible in a quick local test but
   fatal to the actual premise: RTMP clients (and Twitch/YouTube) treat a
   dropped connection as the broadcast ending, not a scene change. Rebuilt
   once this surfaced in real testing — verified by streaming a 3-clip lineup
   with deliberately mismatched resolutions/audio formats end-to-end and
   confirming exactly one publish session covered all three, with the
   received duration matching the sum of all clip durations.

   The RTMP connection now only drops when the whole day's lineup finishes
   and loops back to the start — not between items — and auto-reconnects
   with backoff either way (loop restart or genuine failure).

   **Separate, still-true simplification**: the Playout Engine (which drives
   the UI's Now/Next display and local monitor preview — a different
   mechanism from the streamer above, walking the same lineup on its own
   clock) advances purely by each block's duration from when playout
   started, looping continuously. It does not yet gate against the
   wall-clock `start_time` computed at publish, so a relaunch mid-day
   restarts the lineup from block 1 rather than resuming at the "correct"
   wall-clock position. Wall-clock-accurate resume is real, scoped follow-up
   work, not a hidden gap.

4. **Persistence**: SQLite lives in Electron's `userData` directory, so it
   survives relaunches and app updates. `playout_state` is a durable
   singleton row for future resume-on-relaunch work.

## What's next

- **Wall-clock-accurate playout & resume-after-relaunch** — see simplification note above
- **Gapless block transitions** — persistent concat pipeline or proper switcher instead of per-block ffmpeg respawn
- **Recording to local file** — same ffmpeg pipeline, `-f flv` output swapped for a file target
- Branding/overlays (lower-thirds, crawls), bulletin boards, and the full TV
  guide are roadmap items beyond this MVP scope, not started yet.

