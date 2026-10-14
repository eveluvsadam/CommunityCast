import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Trash2, FolderOpen, Play } from 'lucide-react'
import type { MediaItem, MediaType, ImportProgressEvent } from '@shared/types'
import { api, thumbnailUrl } from '../lib/apiClient'
import { getSocket } from '../lib/socket'
import { formatDuration, formatBytes, formatEta } from '../lib/format'
import { MediaTypeBadge } from '../components/MediaTypeBadge'

const MEDIA_TYPES: MediaType[] = ['program', 'commercial', 'promo', 'announcement', 'bumper']

export function MediaLibrary(): React.JSX.Element {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [importType, setImportType] = useState<MediaType>('program')
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgressEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importingRef = useRef(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { items } = await api.media.list()
      setItems(items)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Only listen while an import is actually in flight — no point holding a
  // socket subscription open the rest of the time.
  useEffect(() => {
    const socket = getSocket()
    const onProgress = (event: ImportProgressEvent): void => {
      if (importingRef.current) setImportProgress(event)
    }
    socket.on('media:import-progress', onProgress)
    return () => void socket.off('media:import-progress', onProgress)
  }, [])

  async function handleImport(): Promise<void> {
    setError(null)
    try {
      const filePaths = await window.communitycast.pickMediaFiles()
      if (filePaths.length === 0) return

      setImporting(true)
      importingRef.current = true
      setImportProgress(null)
      const { results } = await api.media.import(filePaths, importType)
      const failed = results.filter((r) => r.error)
      if (failed.length > 0) {
        setError(`${failed.length} file(s) failed to import: ${failed[0].error}`)
      }
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setImporting(false)
      importingRef.current = false
      setImportProgress(null)
    }
  }

  async function handleDelete(id: number): Promise<void> {
    setItems((prev) => prev.filter((i) => i.id !== id))
    try {
      await api.media.remove(id)
    } catch (err) {
      setError((err as Error).message)
      await refresh()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div className="cc-eyebrow">Content</div>
          <h1>Media Library</h1>
          <p className="cc-subtitle">
            Import video, commercials, promos, announcements, and bumpers. Files are probed for
            duration, resolution, and codec on import.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <select
            value={importType}
            onChange={(e) => setImportType(e.target.value as MediaType)}
            className="cc-select"
          >
            {MEDIA_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={() => void handleImport()}
            disabled={importing}
            className="cc-btn cc-btn-primary"
          >
            <Upload size={15} />
            {importing ? 'Importing…' : 'Import Media'}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="cc-panel"
          style={{
            borderColor: 'var(--cc-on-air)',
            background: 'var(--cc-on-air-dim)',
            padding: '11px 16px',
            marginBottom: 18,
            fontSize: 13
          }}
        >
          {error}
        </div>
      )}

      {importing && <ImportProgressPanel progress={importProgress} />}

      {loading ? (
        <p style={{ color: 'var(--cc-text-dim)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(224px, 1fr))', gap: 18 }}>
          {items.map((item) => (
            <MediaCard key={item.id} item={item} onDelete={() => void handleDelete(item.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ImportProgressPanel({ progress }: { progress: ImportProgressEvent | null }): React.JSX.Element {
  if (!progress) {
    return (
      <div className="cc-panel" style={{ padding: '14px 18px', marginBottom: 18, maxWidth: 480 }}>
        <span style={{ fontSize: 13, color: 'var(--cc-text-dim)' }}>Preparing import…</span>
      </div>
    )
  }

  const percent =
    progress.totalBytes > 0 ? Math.min(100, Math.round((progress.bytesCopied / progress.totalBytes) * 100)) : 0
  const eta =
    progress.phase === 'copying' ? formatEta(progress.totalBytes - progress.bytesCopied, progress.bytesPerSecond) : null

  const phaseLabel =
    progress.phase === 'copying'
      ? `${formatBytes(progress.bytesCopied)} / ${formatBytes(progress.totalBytes)}${
          progress.bytesPerSecond ? ` · ${formatBytes(progress.bytesPerSecond)}/s` : ''
        }`
      : progress.phase === 'probing'
        ? 'Reading metadata…'
        : 'Generating thumbnail…'

  return (
    <div className="cc-panel" style={{ padding: '14px 18px', marginBottom: 18, maxWidth: 480 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          Importing {progress.fileIndex + 1} of {progress.totalFiles}: {progress.fileName}
        </span>
        {eta && (
          <span style={{ fontSize: 11.5, color: 'var(--cc-text-faint)', fontFamily: 'var(--cc-font-mono)' }}>
            {eta}
          </span>
        )}
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--cc-bg-well)',
          overflow: 'hidden',
          marginBottom: 8
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress.phase === 'copying' ? percent : 100}%`,
            background: 'var(--cc-standby)',
            borderRadius: 3,
            transition: 'width 150ms ease'
          }}
        />
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--cc-text-dim)', fontFamily: 'var(--cc-font-mono)' }}>
        {phaseLabel}
      </span>
    </div>
  )
}

function MediaCard({ item, onDelete }: { item: MediaItem; onDelete: () => void }): React.JSX.Element {
  const thumb = thumbnailUrl(item)
  return (
    <div className="cc-card cc-card-hoverable" style={{ overflow: 'hidden' }}>
      <div
        style={{
          aspectRatio: '16 / 9',
          background: 'var(--cc-bg-well)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          borderBottom: '1px solid var(--cc-border)'
        }}
      >
        {thumb ? (
          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ color: 'var(--cc-text-faint)', fontSize: 12 }}>No thumbnail</span>
        )}
        <div
          className="cc-card-play-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
            opacity: 0,
            transition: 'opacity 150ms ease'
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Play size={15} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
          </div>
        </div>
      </div>
      <div style={{ padding: '11px 13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
          <MediaTypeBadge type={item.mediaType} />
          <span style={{ fontFamily: 'var(--cc-font-mono)', fontSize: 12, color: 'var(--cc-text-dim)' }}>
            {formatDuration(item.durationMs)}
          </span>
        </div>
        <div
          title={item.title}
          style={{
            fontSize: 13,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 9
          }}
        >
          {item.title}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--cc-text-faint)' }}>
            {item.resolution ?? '—'}
            {item.codec ? ` · ${item.codec}` : ''}
          </span>
          <button onClick={onDelete} className="cc-btn-icon" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <style>{`.cc-card-hoverable:hover .cc-card-play-overlay { opacity: 1; }`}</style>
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  return (
    <div
      className="cc-well"
      style={{
        border: '1px dashed var(--cc-border-strong)',
        padding: '56px 24px',
        textAlign: 'center',
        color: 'var(--cc-text-dim)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12
      }}
    >
      <FolderOpen size={28} color="var(--cc-text-faint)" />
      <div>Your library is empty. Import your first video, commercial, or promo to get started.</div>
    </div>
  )
}
