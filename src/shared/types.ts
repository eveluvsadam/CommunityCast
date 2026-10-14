// Shared data contracts between the main process (server + db) and the
// renderer (React UI). Keeping these in one place means the HTTP API and
// the DB layer can't silently drift apart from what the UI expects.

export type MediaType = 'program' | 'commercial' | 'promo' | 'announcement' | 'bumper'

export interface MediaItem {
  id: number
  title: string
  filePath: string
  mediaType: MediaType
  durationMs: number | null
  resolution: string | null
  codec: string | null
  thumbnailPath: string | null
  createdAt: string
}

export type ScheduleStatus = 'draft' | 'published'

export interface DailySchedule {
  id: number
  date: string // ISO date, e.g. "2026-07-10"
  status: ScheduleStatus
}

export interface ScheduleBlock {
  id: number
  dailyScheduleId: number
  mediaItemId: number
  orderIndex: number
  startTime: string | null // HH:mm:ss, computed when the schedule is published
}

/** A schedule block joined with its media item, as the UI actually wants to render it. */
export interface ScheduleBlockWithMedia extends ScheduleBlock {
  media: MediaItem
}

export type PlayoutStatus = 'idle' | 'playing' | 'paused'

export interface PlayoutState {
  currentBlockId: number | null
  blockStartedAt: string | null // ISO timestamp
  offsetMs: number
  status: PlayoutStatus
}

/** Pushed over the socket whenever the Playout Engine advances. */
export interface PlayoutTick {
  state: PlayoutState
  current: ScheduleBlockWithMedia | null
  next: ScheduleBlockWithMedia | null
}

/** What the REST/socket layer actually exposes: engine tick plus streaming status. */
export interface PlayoutStatusResponse extends PlayoutTick {
  isStreaming: boolean
  rtmpUrl: string | null
  /** Always present while streaming — local HLS playback URL, watchable directly in Safari. */
  hlsUrl: string | null
}

export interface StartPlayoutRequest {
  date: string
  rtmpUrl?: string
}

export interface RecordingStatus {
  recording: boolean
  filePath: string | null
  sourceUrl: string | null
  startedAt: string | null
}

export interface StartRecordingRequest {
  sourceUrl?: string
}

export interface RecordingFile {
  filename: string
  sizeBytes: number
  createdAt: string
}

export interface ScheduleResponse {
  schedule: DailySchedule
  blocks: ScheduleBlockWithMedia[]
}

export interface AddBlockRequest {
  mediaItemId: number
}

export interface ReorderBlocksRequest {
  blockIds: number[]
}
export interface HealthResponse {
  ok: true
  version: string
  dbPath: string
  /** This machine's LAN IPv4 address (e.g. 192.168.1.50), if detectable —
   * lets the UI show real, LAN-reachable URLs instead of making the person
   * hunt for their own IP address. Null if it couldn't be determined. */
  lanIp: string | null
}

export type ImportPhase = 'copying' | 'probing' | 'thumbnailing'

/** Pushed over the socket during an active import — real byte-level progress
 * for the copy phase (the dominant cost for typical video files), phase
 * name only for probing/thumbnailing since those don't have a natural
 * progress metric. */
export interface ImportProgressEvent {
  fileIndex: number
  totalFiles: number
  fileName: string
  phase: ImportPhase
  bytesCopied: number
  totalBytes: number
  bytesPerSecond: number | null
}

export interface ImportMediaRequest {
  filePaths: string[]
  mediaType: MediaType
}

export interface ImportMediaResultItem {
  sourcePath: string
  item: MediaItem | null
  error: string | null
}

export interface ImportMediaResponse {
  results: ImportMediaResultItem[]
}
