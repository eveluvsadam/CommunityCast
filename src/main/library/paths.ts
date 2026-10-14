import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

/**
 * The managed media library root. MVP keeps this fixed under userData;
 * making it user-configurable (e.g. an external drive) is a natural Phase 2+
 * follow-up once import itself is proven out, not a blocker for it.
 */
export function getLibraryRoot(): string {
  return join(app.getPath('userData'), 'media-library')
}

export function getFilesDir(): string {
  return join(getLibraryRoot(), 'files')
}

export function getThumbnailsDir(): string {
  return join(getLibraryRoot(), 'thumbnails')
}

/** Local HLS segment output — lets the channel be watched directly in a
 * browser (Safari has native HLS support) without any extra software,
 * independent of whether an external RTMP destination is also configured. */
export function getHlsDir(): string {
  return join(getLibraryRoot(), 'hls')
}

/** Where recordings of the (live) output stream are saved — separate from
 * the source media library, since these are recordings of the broadcast
 * itself, not imported source content. */
export function getRecordingsDir(): string {
  return join(getLibraryRoot(), 'recordings')
}

export function ensureLibraryDirs(): void {
  for (const dir of [getLibraryRoot(), getFilesDir(), getThumbnailsDir(), getHlsDir(), getRecordingsDir()]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
}
