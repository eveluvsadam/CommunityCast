import React, { useCallback, useEffect, useState } from 'react'
import { Plus, ArrowUp, ArrowDown, X, Radio, ListMusic } from 'lucide-react'
import type { MediaItem, ScheduleBlockWithMedia, DailySchedule } from '@shared/types'
import { api, thumbnailUrl } from '../lib/apiClient'
import { formatDuration } from '../lib/format'
import { MediaTypeBadge } from '../components/MediaTypeBadge'

function todayLocalDate(): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function Scheduler(): React.JSX.Element {
  const [date, setDate] = useState(todayLocalDate())
  const [schedule, setSchedule] = useState<DailySchedule | null>(null)
  const [blocks, setBlocks] = useState<ScheduleBlockWithMedia[]>([])
  const [library, setLibrary] = useState<MediaItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [scheduleRes, libraryRes] = await Promise.all([api.schedule.get(date), api.media.list()])
      setSchedule(scheduleRes.schedule)
      setBlocks(scheduleRes.blocks)
      setLibrary(libraryRes.items)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [date])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function withBusy(fn: () => Promise<void>): Promise<void> {
    setBusy(true)
    try {
      await fn()
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const totalMs = blocks.reduce((sum, b) => sum + (b.media.durationMs ?? 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="cc-eyebrow">Programming</div>
          <h1>Scheduler</h1>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="cc-input" />
      </div>
      <p className="cc-subtitle">Build the day's ordered playlist from your media library, then publish it.</p>

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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 26, marginTop: 8 }}>
        <section>
          <SectionHeader title="Media Library" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {library.length === 0 && (
              <p style={{ color: 'var(--cc-text-dim)', fontSize: 13 }}>
                No media imported yet — add some in Media Library first.
              </p>
            )}
            {library.map((item) => {
              const thumb = thumbnailUrl(item)
              return (
                <div
                  key={item.id}
                  className="cc-card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 10px 7px 7px'
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 26,
                      borderRadius: 4,
                      overflow: 'hidden',
                      background: 'var(--cc-bg-well)',
                      flexShrink: 0
                    }}
                  >
                    {thumb && <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                      <MediaTypeBadge type={item.mediaType} />
                      <span style={{ fontFamily: 'var(--cc-font-mono)', fontSize: 11, color: 'var(--cc-text-faint)' }}>
                        {formatDuration(item.durationMs)}
                      </span>
                    </div>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => void withBusy(async () => { await api.schedule.addBlock(date, item.id); await refresh() })}
                    className="cc-btn-icon"
                    title="Add to lineup"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionHeader title={`Lineup for ${date}`} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <StatusBadge status={schedule?.status ?? 'draft'} />
              <span style={{ fontFamily: 'var(--cc-font-mono)', fontSize: 12, color: 'var(--cc-text-dim)' }}>
                {formatDuration(totalMs)} total
              </span>
            </div>
          </div>

          {blocks.length === 0 ? (
            <div
              className="cc-well"
              style={{
                border: '1px dashed var(--cc-border-strong)',
                padding: '32px 20px',
                textAlign: 'center',
                color: 'var(--cc-text-dim)',
                fontSize: 13,
                marginBottom: 18,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8
              }}
            >
              <ListMusic size={22} color="var(--cc-text-faint)" />
              Nothing scheduled yet — add items from the library on the left.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              {blocks.map((block, index) => {
                const thumb = thumbnailUrl(block.media)
                return (
                  <div
                    key={block.id}
                    className="cc-card"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px 7px 7px' }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--cc-font-mono)',
                        fontSize: 11,
                        color: 'var(--cc-text-faint)',
                        width: 58,
                        flexShrink: 0,
                        textAlign: 'right'
                      }}
                    >
                      {block.startTime ? block.startTime.slice(0, 8) : `#${index + 1}`}
                    </span>
                    <div
                      style={{
                        width: 44,
                        height: 26,
                        borderRadius: 4,
                        overflow: 'hidden',
                        background: 'var(--cc-bg-well)',
                        flexShrink: 0
                      }}
                    >
                      {thumb && <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <MediaTypeBadge type={block.media.mediaType} />
                    <span
                      style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {block.media.title}
                    </span>
                    <span style={{ fontFamily: 'var(--cc-font-mono)', fontSize: 11, color: 'var(--cc-text-dim)' }}>
                      {formatDuration(block.media.durationMs)}
                    </span>
                    <button
                      disabled={busy || index === 0}
                      onClick={() => void withBusy(async () => {
                        const ids = blocks.map((b) => b.id)
                        ;[ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]
                        await api.schedule.reorder(date, ids)
                        await refresh()
                      })}
                      className="cc-btn-icon"
                      title="Move up"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      disabled={busy || index === blocks.length - 1}
                      onClick={() => void withBusy(async () => {
                        const ids = blocks.map((b) => b.id)
                        ;[ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]
                        await api.schedule.reorder(date, ids)
                        await refresh()
                      })}
                      className="cc-btn-icon"
                      title="Move down"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void withBusy(async () => { await api.schedule.removeBlock(date, block.id); await refresh() })}
                      className="cc-btn-icon"
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              disabled={busy || blocks.length === 0}
              onClick={() => void withBusy(async () => { await api.schedule.publish(date); await refresh() })}
              className="cc-btn cc-btn-primary"
            >
              <Radio size={15} />
              Publish Schedule
            </button>
            <span style={{ color: 'var(--cc-text-faint)', fontSize: 12 }}>
              Computes start times and marks the day ready to air.
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <h3
      style={{
        fontSize: 12,
        color: 'var(--cc-text-faint)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: 12
      }}
    >
      {title}
    </h3>
  )
}

function StatusBadge({ status }: { status: 'draft' | 'published' }): React.JSX.Element {
  const color = status === 'published' ? 'var(--cc-standby)' : 'var(--cc-caution)'
  return (
    <span className="cc-badge" style={{ color }}>
      {status.toUpperCase()}
    </span>
  )
}
