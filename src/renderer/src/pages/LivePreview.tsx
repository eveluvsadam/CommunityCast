import React, { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import {
  Play,
  Square,
  ChevronDown,
  ChevronUp,
  Radio,
  Copy,
  Check,
  ExternalLink,
  Circle,
  Disc,
  Download,
  Activity
} from 'lucide-react'
import type { PlayoutStatusResponse, RecordingStatus, RecordingFile, ScheduleBlockWithMedia } from '@shared/types'
import { api, thumbnailUrl } from '../lib/apiClient'
import { getSocket } from '../lib/socket'
import { parseLatestFfmpegProgress } from '../lib/ffmpegLog'
import { formatBytes } from '../lib/format'
import { TallyDot } from '../components/TallyDot'
import { MediaTypeBadge } from '../components/MediaTypeBadge'

const RECORDINGS_BASE = 'http://127.0.0.1:47811/recordings'

function todayLocalDate(): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function LivePreview(): React.JSX.Element {
  const [status, setStatus] = useState<PlayoutStatusResponse | null>(null)
  const [date, setDate] = useState(todayLocalDate())
  const [rtmpUrl, setRtmpUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [lanIp, setLanIp] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  // --- Recording state ---
  const [recStatus, setRecStatus] = useState<RecordingStatus | null>(null)
  const [recSourceUrl, setRecSourceUrl] = useState('')
  const [recBusy, setRecBusy] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)
  const [recFiles, setRecFiles] = useState<RecordingFile[]>([])
  const [showRecordings, setShowRecordings] = useState(false)

  useEffect(() => {
    void api.playout.state().then(setStatus).catch((err) => setError((err as Error).message))
    void api.recording.status().then(setRecStatus).catch(() => {})
    void api.health().then((h) => setLanIp(h.lanIp)).catch(() => {})
    const socket = getSocket()
    const onTick = (tick: PlayoutStatusResponse): void => setStatus(tick)
    socket.on('playout:tick', onTick)
    return () => void socket.off('playout:tick', onTick)
  }, [])

  // Attach hls.js to the real broadcast output — not the raw source file —
  // so the preview shows exactly what's actually airing (including
  // letterboxing/normalization), the same as any real viewer would see.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let retryTimer: ReturnType<typeof setTimeout> | null = null

    if (status?.hlsUrl && !hlsRef.current) {
      if (Hls.isSupported()) {
        const hls = new Hls({ liveSyncDurationCount: 3 })
        hlsRef.current = hls

        // Without this, a single failure — most commonly the manifest 404
        // right after "Go Live" because ffmpeg hasn't written its first
        // segment yet, but also any later network blip — permanently kills
        // playback with no retry. This is hls.js's own documented recovery
        // pattern, not a custom workaround.
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (retryTimer) clearTimeout(retryTimer)
              retryTimer = setTimeout(() => hls.startLoad(), 1500)
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              hls.destroy()
              if (hlsRef.current === hls) hlsRef.current = null
              break
          }
        })

        hls.loadSource(status.hlsUrl)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => {}))
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = status.hlsUrl
        void video.play().catch(() => {})
      }
    }

    if (!status?.hlsUrl && hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
      video.removeAttribute('src')
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      if (!status?.hlsUrl) return
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [status?.hlsUrl])

  // Poll ffmpeg's own log for stream health even when the panel is
  // collapsed — this is what "the stream is going well" actually needs:
  // visible, continuously-updated evidence, not just a static dot.
  useEffect(() => {
    if (status?.state.status !== 'playing') return
    const id = setInterval(() => void api.playout.log().then((r) => setLog(r.lines)), 2000)
    return () => clearInterval(id)
  }, [status?.state.status])

  useEffect(() => {
    if (!recStatus?.recording) return
    const id = setInterval(() => void api.recording.status().then(setRecStatus), 3000)
    return () => clearInterval(id)
  }, [recStatus?.recording])

  useEffect(() => {
    if (showRecordings) void api.recording.list().then((r) => setRecFiles(r.files))
  }, [showRecordings, recStatus?.recording])

  async function handleGoLive(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setStatus(await api.playout.start(date, rtmpUrl.trim() || undefined))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleStop(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setStatus(await api.playout.stop())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleStartRecording(): Promise<void> {
    setRecBusy(true)
    setRecError(null)
    try {
      setRecStatus(await api.recording.start(recSourceUrl.trim() || undefined))
    } catch (err) {
      setRecError((err as Error).message)
    } finally {
      setRecBusy(false)
    }
  }

  async function handleStopRecording(): Promise<void> {
    setRecBusy(true)
    setRecError(null)
    try {
      setRecStatus(await api.recording.stop())
      void api.recording.list().then((r) => setRecFiles(r.files))
    } catch (err) {
      setRecError((err as Error).message)
    } finally {
      setRecBusy(false)
    }
  }

  const isLive = status?.state.status === 'playing'
  const isStreaming = status?.isStreaming ?? false
  const progress = parseLatestFfmpegProgress(log)
  const lastLogLine = log[log.length - 1] ?? null

  return (
    <div>
      <div className="cc-eyebrow">Channel Control</div>
      <h1>Live Preview</h1>
      <p className="cc-subtitle">
        Airs the published schedule for the selected date, looping continuously. This monitor
        shows the actual broadcast output — the same thing any viewer sees — not a raw source clip.
      </p>

      {error && (
        <div
          className="cc-panel"
          style={{
            borderColor: 'var(--cc-on-air)',
            background: 'var(--cc-on-air-dim)',
            padding: '11px 16px',
            marginBottom: 18,
            fontSize: 13,
            maxWidth: 760
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
        <input
          type="date"
          value={date}
          disabled={isLive}
          onChange={(e) => setDate(e.target.value)}
          className="cc-input"
        />
        <input
          type="text"
          value={rtmpUrl}
          disabled={isLive}
          onChange={(e) => setRtmpUrl(e.target.value)}
          placeholder="Optional: also push to an external rtmp:// destination"
          className="cc-input"
          style={{ width: 360, fontFamily: 'var(--cc-font-mono)' }}
        />
        {!isLive ? (
          <button disabled={busy} onClick={() => void handleGoLive()} className="cc-btn cc-btn-air">
            <Play size={15} fill="currentColor" />
            {busy ? 'Starting…' : 'Go Live'}
          </button>
        ) : (
          <button disabled={busy} onClick={() => void handleStop()} className="cc-btn cc-btn-ghost">
            <Square size={14} fill="currentColor" />
            {busy ? 'Stopping…' : 'Stop'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div
            className={`cc-monitor ${isLive ? 'cc-monitor-air' : ''}`}
            style={{ width: 512, aspectRatio: '16 / 9', position: 'relative' }}
          >
            <video ref={videoRef} controls muted style={{ width: '100%', height: '100%', position: 'relative', zIndex: 0 }} />
            {!status?.hlsUrl && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  color: 'var(--cc-text-faint)',
                  fontSize: 13
                }}
              >
                <Radio size={22} />
                No channel is on air
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
            <TallyDot state={isLive ? 'on-air' : 'off'} />
            {isLive && (
              <StreamHealthBadge
                hasRecentLog={log.length > 0}
                speed={progress?.speed ?? null}
                fps={progress?.fps ?? null}
              />
            )}
            {isLive && (
              <span style={{ fontSize: 12, color: 'var(--cc-text-dim)' }}>
                {isStreaming && status?.rtmpUrl ? `Also streaming to ${status.rtmpUrl}` : 'Local channel only'}
              </span>
            )}
          </div>

          {isLive && lastLogLine && (
            <div
              style={{
                marginTop: 6,
                fontFamily: 'var(--cc-font-mono)',
                fontSize: 10.5,
                color: 'var(--cc-text-faint)',
                maxWidth: 512,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {lastLogLine}
            </div>
          )}

          {isLive && status?.hlsUrl && (
            <div
              className="cc-well"
              style={{
                marginTop: 14,
                padding: '11px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                maxWidth: 512
              }}
            >
              <WatchUrlRow
                label="This Mac — opens directly in Safari"
                url={status.hlsUrl}
                copied={copied}
                onCopy={() => {
                  void navigator.clipboard.writeText(status.hlsUrl ?? '')
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              />
              {lanIp && (
                <WatchUrlRow
                  label="Other devices on your home network"
                  url={`http://${lanIp}:8088/hls/index.m3u8`}
                  copied={copied}
                  onCopy={() => {
                    void navigator.clipboard.writeText(`http://${lanIp}:8088/hls/index.m3u8`)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                />
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <NowNextCard label="NOW" block={status?.current ?? null} />
          <NowNextCard label="NEXT" block={status?.next ?? null} />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <button onClick={() => setShowLog((v) => !v)} className="cc-link-btn">
          {showLog ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Full streaming diagnostics
        </button>
        {showLog && (
          <pre
            className="cc-well"
            style={{
              marginTop: 8,
              padding: 14,
              fontSize: 11,
              fontFamily: 'var(--cc-font-mono)',
              maxHeight: 220,
              overflowY: 'auto',
              color: 'var(--cc-text-dim)',
              maxWidth: 760
            }}
          >
            {log.length > 0 ? log.join('\n') : 'No ffmpeg output yet.'}
          </pre>
        )}
      </div>

      <div className="cc-panel" style={{ marginTop: 32, padding: 20, maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Disc size={16} color={recStatus?.recording ? 'var(--cc-on-air)' : 'var(--cc-text-dim)'} />
          <h3 style={{ margin: 0, fontSize: 15 }}>Recording</h3>
        </div>
        <p style={{ color: 'var(--cc-text-dim)', fontSize: 12.5, margin: '4px 0 14px', maxWidth: 600 }}>
          Records the actual output stream from an <strong>rtmp://</strong> source — not the source
          clips, and not the local HLS URL above (ffmpeg couldn't reliably read that format as an
          input during testing — see README). If you're pushing to an external destination, this
          defaults to recording that. For a purely local recording, run{' '}
          <code style={{ fontFamily: 'var(--cc-font-mono)', fontSize: 11.5 }}>npm run rtmp:test-server</code>{' '}
          and use its printed URL both as your Go Live RTMP URL and here.
        </p>

        {recError && (
          <div
            className="cc-panel"
            style={{
              borderColor: 'var(--cc-on-air)',
              background: 'var(--cc-on-air-dim)',
              padding: '9px 14px',
              marginBottom: 12,
              fontSize: 13
            }}
          >
            {recError}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={recSourceUrl}
            disabled={recStatus?.recording}
            onChange={(e) => setRecSourceUrl(e.target.value)}
            placeholder={status?.rtmpUrl ?? 'rtmp://127.0.0.1:1935/live/<your-key>'}
            className="cc-input"
            style={{ width: 380, fontFamily: 'var(--cc-font-mono)' }}
          />
          {!recStatus?.recording ? (
            <button
              disabled={recBusy || !isLive}
              onClick={() => void handleStartRecording()}
              className="cc-btn cc-btn-air"
              title={!isLive ? 'Go live first — nothing to record yet' : undefined}
            >
              <Circle size={13} fill="currentColor" />
              {recBusy ? 'Starting…' : 'Start Recording'}
            </button>
          ) : (
            <button disabled={recBusy} onClick={() => void handleStopRecording()} className="cc-btn cc-btn-ghost">
              <Square size={13} fill="currentColor" />
              {recBusy ? 'Stopping…' : 'Stop Recording'}
            </button>
          )}
        </div>

        {recStatus?.recording && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <TallyDot state="on-air" showLabel={false} size={7} />
            <span style={{ fontSize: 12, color: 'var(--cc-text-dim)' }}>
              Recording since {recStatus.startedAt ? new Date(recStatus.startedAt).toLocaleTimeString() : '—'} to{' '}
              <span style={{ fontFamily: 'var(--cc-font-mono)' }}>{recStatus.filePath?.split('/').pop()}</span>
            </span>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button onClick={() => setShowRecordings((v) => !v)} className="cc-link-btn">
            {showRecordings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Past recordings
          </button>
          {showRecordings && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recFiles.length === 0 && (
                <p style={{ color: 'var(--cc-text-faint)', fontSize: 12.5 }}>No recordings yet.</p>
              )}
              {recFiles.map((f) => (
                <div
                  key={f.filename}
                  className="cc-well"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    fontSize: 12.5
                  }}
                >
                  <span style={{ fontFamily: 'var(--cc-font-mono)' }}>{f.filename}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: 'var(--cc-text-faint)' }}>{formatBytes(f.sizeBytes)}</span>
                    <a href={`${RECORDINGS_BASE}/${f.filename}`} download className="cc-btn-icon" title="Download">
                      <Download size={13} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StreamHealthBadge({
  hasRecentLog,
  speed,
  fps
}: {
  hasRecentLog: boolean
  speed: number | null
  fps: number | null
}): React.JSX.Element {
  const state: 'healthy' | 'behind' | 'starting' =
    !hasRecentLog || speed === null ? 'starting' : speed >= 0.9 ? 'healthy' : 'behind'

  const color =
    state === 'healthy' ? 'var(--cc-standby)' : state === 'behind' ? 'var(--cc-caution)' : 'var(--cc-text-faint)'
  const label =
    state === 'healthy'
      ? `Encoding well${speed ? ` · ${speed.toFixed(2)}x` : ''}${fps ? ` · ${fps}fps` : ''}`
      : state === 'behind'
        ? `Falling behind · ${speed?.toFixed(2)}x`
        : 'Starting…'

  return (
    <span className="cc-badge" style={{ color, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
      <Activity size={11} />
      {label}
    </span>
  )
}

function WatchUrlRow({
  label,
  url,
  copied,
  onCopy
}: {
  label: string
  url: string
  copied: boolean
  onCopy: () => void
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--cc-text-faint)', marginBottom: 3 }}>{label}</div>
        <div
          style={{
            fontFamily: 'var(--cc-font-mono)',
            fontSize: 12,
            color: 'var(--cc-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {url}
        </div>
      </div>
      <button className="cc-btn-icon" title="Copy URL" onClick={onCopy}>
        {copied ? <Check size={14} color="var(--cc-standby)" /> : <Copy size={14} />}
      </button>
      <a href={url} target="_blank" rel="noreferrer" className="cc-btn-icon" title="Open">
        <ExternalLink size={14} />
      </a>
    </div>
  )
}

function NowNextCard({
  label,
  block
}: {
  label: 'NOW' | 'NEXT'
  block: ScheduleBlockWithMedia | null
}): React.JSX.Element {
  const thumb = block ? thumbnailUrl(block.media) : null
  const accent = label === 'NOW' ? 'var(--cc-on-air)' : 'var(--cc-standby)'
  return (
    <div className="cc-card" style={{ width: 228, overflow: 'hidden' }}>
      <div
        style={{
          aspectRatio: '16 / 9',
          background: 'var(--cc-bg-well)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid var(--cc-border)'
        }}
      >
        {thumb ? (
          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ color: 'var(--cc-text-faint)', fontSize: 11 }}>—</span>
        )}
      </div>
      <div style={{ padding: '10px 14px' }}>
        <div
          style={{
            fontFamily: 'var(--cc-font-mono)',
            fontSize: 10,
            letterSpacing: '0.12em',
            color: accent,
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          {label === 'NOW' && (
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: accent,
                boxShadow: '0 0 6px 1px var(--cc-on-air-glow)'
              }}
            />
          )}
          {label}
        </div>
        {block ? (
          <>
            <div style={{ marginBottom: 6 }}>
              <MediaTypeBadge type={block.media.mediaType} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{block.media.title}</div>
          </>
        ) : (
          <div style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>Nothing scheduled</div>
        )}
      </div>
    </div>
  )
}


