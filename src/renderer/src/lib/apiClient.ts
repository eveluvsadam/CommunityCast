import type {
  HealthResponse,
  ImportMediaResponse,
  MediaItem,
  MediaType,
  ScheduleResponse,
  PlayoutStatusResponse,
  RecordingStatus,
  RecordingFile
} from '@shared/types'

export const API_BASE = 'http://127.0.0.1:47811'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { error?: string }).error ??
        `${init?.method ?? 'GET'} ${path} failed: ${res.status} ${res.statusText}`
    )
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  media: {
    list: () => request<{ items: MediaItem[] }>('/api/media'),
    import: (filePaths: string[], mediaType: MediaType) =>
      request<ImportMediaResponse>('/api/media/import', {
        method: 'POST',
        body: JSON.stringify({ filePaths, mediaType })
      }),
    remove: (id: number) => request<{ ok: true }>(`/api/media/${id}`, { method: 'DELETE' })
  },
  schedule: {
    get: (date: string) => request<ScheduleResponse>(`/api/schedule/${date}`),
    addBlock: (date: string, mediaItemId: number) =>
      request<ScheduleResponse>(`/api/schedule/${date}/blocks`, {
        method: 'POST',
        body: JSON.stringify({ mediaItemId })
      }),
    removeBlock: (date: string, blockId: number) =>
      request<ScheduleResponse>(`/api/schedule/${date}/blocks/${blockId}`, { method: 'DELETE' }),
    reorder: (date: string, blockIds: number[]) =>
      request<ScheduleResponse>(`/api/schedule/${date}/blocks/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ blockIds })
      }),
    publish: (date: string) =>
      request<ScheduleResponse>(`/api/schedule/${date}/publish`, { method: 'POST' })
  },
  playout: {
    state: () => request<PlayoutStatusResponse>('/api/playout/state'),
    start: (date: string, rtmpUrl?: string) =>
      request<PlayoutStatusResponse>('/api/playout/start', {
        method: 'POST',
        body: JSON.stringify({ date, rtmpUrl })
      }),
    stop: () => request<PlayoutStatusResponse>('/api/playout/stop', { method: 'POST' }),
    log: () => request<{ lines: string[] }>('/api/playout/log')
  },
  recording: {
    status: () => request<RecordingStatus>('/api/recording/status'),
    start: (sourceUrl?: string) =>
      request<RecordingStatus>('/api/recording/start', {
        method: 'POST',
        body: JSON.stringify({ sourceUrl })
      }),
    stop: () => request<RecordingStatus>('/api/recording/stop', { method: 'POST' }),
    list: () => request<{ files: RecordingFile[] }>('/api/recording/list'),
    log: () => request<{ lines: string[] }>('/api/recording/log')
  }
}

/** Builds a browser-loadable URL for a media item's generated thumbnail. */
export function thumbnailUrl(item: MediaItem): string | null {
  if (!item.thumbnailPath) return null
  const filename = item.thumbnailPath.split('/').pop()
  return `${API_BASE}/media/thumbnails/${filename}`
}

/** Builds a browser-loadable URL for a media item's actual video file (local monitor preview). */
export function fileUrl(item: MediaItem): string {
  const filename = item.filePath.split('/').pop()
  return `${API_BASE}/media/files/${filename}`
}
