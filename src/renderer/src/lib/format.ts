export function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const totalSeconds = Math.round(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** Formats a byte rate + remaining bytes into a human ETA — the actual
 * point of tracking real byte progress rather than a fake spinner. */
export function formatEta(remainingBytes: number, bytesPerSecond: number | null): string | null {
  if (!bytesPerSecond || bytesPerSecond <= 0) return null
  const seconds = remainingBytes / bytesPerSecond
  if (seconds < 1) return 'almost done'
  if (seconds < 60) return `~${Math.ceil(seconds)}s remaining`
  const minutes = Math.ceil(seconds / 60)
  return `~${minutes}m remaining`
}
