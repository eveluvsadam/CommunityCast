import { randomUUID } from 'crypto'
import { createReadStream, createWriteStream, statSync } from 'fs'
import { rm } from 'fs/promises'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'
import { basename, extname, join } from 'path'
import type Database from 'better-sqlite3'
import type { MediaItem, MediaType, ImportProgressEvent } from '@shared/types'
import { getFilesDir, getThumbnailsDir, ensureLibraryDirs } from './paths'
import { probeMedia, generateThumbnail } from './probe'
import { insertMediaItem, deleteMediaItem, getMediaItem } from '../db/mediaRepo'

export interface ImportResult {
  item: MediaItem | null
  sourcePath: string
  error: string | null
}

export type ImportProgressCallback = (event: ImportProgressEvent) => void

// Emitting on every stream chunk would flood the socket for a fast local
// disk copy; throttle to a sane update rate instead.
const PROGRESS_THROTTLE_MS = 150

/**
 * Copies a file via streams (not fs.copyFile, which gives no progress hook),
 * reporting real byte-level progress as it goes — this is what makes the
 * progress bar and ETA actually accurate rather than a fake spinner.
 */
async function copyFileWithProgress(
  src: string,
  dest: string,
  onChunk: (bytesCopied: number, totalBytes: number, bytesPerSecond: number) => void
): Promise<void> {
  const totalBytes = statSync(src).size
  const startedAt = Date.now()
  let bytesCopied = 0
  let lastEmitAt = 0

  const progressTap = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      bytesCopied += chunk.length
      const now = Date.now()
      if (now - lastEmitAt >= PROGRESS_THROTTLE_MS || bytesCopied === totalBytes) {
        lastEmitAt = now
        const elapsedSec = Math.max(0.001, (now - startedAt) / 1000)
        onChunk(bytesCopied, totalBytes, bytesCopied / elapsedSec)
      }
      callback(null, chunk)
    }
  })

  await pipeline(createReadStream(src), progressTap, createWriteStream(dest))
}

/**
 * Imports one source file: copies it into the managed library folder under a
 * generated name (so we never collide on duplicate filenames from different
 * source folders), probes it, thumbnails it, and records it in SQLite.
 * Never throws — a single bad file in a multi-file import shouldn't abort
 * the rest; failures come back in the result instead.
 */
async function importOne(
  db: Database.Database,
  sourcePath: string,
  mediaType: MediaType,
  fileIndex: number,
  totalFiles: number,
  onProgress?: ImportProgressCallback
): Promise<ImportResult> {
  const fileName = basename(sourcePath)
  const emit = (
    phase: ImportProgressEvent['phase'],
    bytesCopied: number,
    totalBytes: number,
    bytesPerSecond: number | null
  ): void => {
    onProgress?.({ fileIndex, totalFiles, fileName, phase, bytesCopied, totalBytes, bytesPerSecond })
  }

  try {
    const ext = extname(sourcePath)
    const id = randomUUID()
    const destPath = join(getFilesDir(), `${id}${ext}`)

    await copyFileWithProgress(sourcePath, destPath, (bytesCopied, totalBytes, bytesPerSecond) =>
      emit('copying', bytesCopied, totalBytes, bytesPerSecond)
    )

    const totalBytes = statSync(destPath).size
    emit('probing', totalBytes, totalBytes, null)
    const probeResult = await probeMedia(destPath)

    emit('thumbnailing', totalBytes, totalBytes, null)
    const thumbnailPath = join(getThumbnailsDir(), `${id}.jpg`)
    const thumbnailOk = await generateThumbnail(destPath, thumbnailPath, probeResult.durationMs)

    const item = insertMediaItem(db, {
      title: basename(sourcePath, ext),
      filePath: destPath,
      mediaType,
      durationMs: probeResult.durationMs,
      resolution: probeResult.resolution,
      codec: probeResult.codec,
      thumbnailPath: thumbnailOk ? thumbnailPath : null
    })

    return { item, sourcePath, error: null }
  } catch (err) {
    return { item: null, sourcePath, error: (err as Error).message }
  }
}

export async function importMediaFiles(
  db: Database.Database,
  sourcePaths: string[],
  mediaType: MediaType,
  onProgress?: ImportProgressCallback
): Promise<ImportResult[]> {
  ensureLibraryDirs()
  const results: ImportResult[] = []
  // Sequential rather than Promise.all: ffmpeg/ffprobe are CPU-bound child
  // processes, and concurrent disk copies would thrash rather than speed
  // things up — also keeps progress reporting meaningful (one active file
  // at a time, not N simultaneous partial percentages).
  for (let i = 0; i < sourcePaths.length; i++) {
    results.push(await importOne(db, sourcePaths[i], mediaType, i, sourcePaths.length, onProgress))
  }
  return results
}

/** Deletes a media item's DB row and its managed files (source copy + thumbnail). */
export async function removeMediaItem(db: Database.Database, id: number): Promise<boolean> {
  const existing = getMediaItem(db, id)
  if (!existing) return false

  deleteMediaItem(db, id)

  await Promise.allSettled([
    rm(existing.filePath, { force: true }),
    existing.thumbnailPath ? rm(existing.thumbnailPath, { force: true }) : Promise.resolve()
  ])

  return true
}
