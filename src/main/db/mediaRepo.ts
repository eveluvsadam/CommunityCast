import type Database from 'better-sqlite3'
import type { MediaItem, MediaType } from '@shared/types'

export interface MediaItemRow {
  id: number
  title: string
  file_path: string
  media_type: MediaType
  duration_ms: number | null
  resolution: string | null
  codec: string | null
  thumbnail_path: string | null
  created_at: string
}

export function rowToMediaItem(row: MediaItemRow): MediaItem {
  return {
    id: row.id,
    title: row.title,
    filePath: row.file_path,
    mediaType: row.media_type,
    durationMs: row.duration_ms,
    resolution: row.resolution,
    codec: row.codec,
    thumbnailPath: row.thumbnail_path,
    createdAt: row.created_at
  }
}

export interface NewMediaItem {
  title: string
  filePath: string
  mediaType: MediaType
  durationMs: number | null
  resolution: string | null
  codec: string | null
  thumbnailPath: string | null
}

export function listMediaItems(db: Database.Database): MediaItem[] {
  const rows = db
    .prepare('SELECT * FROM media_items ORDER BY created_at DESC')
    .all() as MediaItemRow[]
  return rows.map(rowToMediaItem)
}

export function getMediaItem(db: Database.Database, id: number): MediaItem | null {
  const row = db.prepare('SELECT * FROM media_items WHERE id = ?').get(id) as
    | MediaItemRow
    | undefined
  return row ? rowToMediaItem(row) : null
}

export function insertMediaItem(db: Database.Database, item: NewMediaItem): MediaItem {
  const result = db
    .prepare(
      `INSERT INTO media_items (title, file_path, media_type, duration_ms, resolution, codec, thumbnail_path)
       VALUES (@title, @filePath, @mediaType, @durationMs, @resolution, @codec, @thumbnailPath)`
    )
    .run({
      title: item.title,
      filePath: item.filePath,
      mediaType: item.mediaType,
      durationMs: item.durationMs,
      resolution: item.resolution,
      codec: item.codec,
      thumbnailPath: item.thumbnailPath
    })

  const created = getMediaItem(db, Number(result.lastInsertRowid))
  if (!created) throw new Error('Failed to read back inserted media item')
  return created
}

/** Returns the deleted row (so the caller can clean up its files on disk), or null if it didn't exist. */
export function deleteMediaItem(db: Database.Database, id: number): MediaItem | null {
  const existing = getMediaItem(db, id)
  if (!existing) return null
  db.prepare('DELETE FROM media_items WHERE id = ?').run(id)
  return existing
}
