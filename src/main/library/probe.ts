import { execFile } from 'child_process'
import { promisify } from 'util'
import ffprobeStatic from 'ffprobe-static'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

export interface ProbeResult {
  durationMs: number | null
  resolution: string | null
  codec: string | null
}

interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
}

interface FfprobeOutput {
  format?: { duration?: string }
  streams?: FfprobeStream[]
}

/** Reads duration/resolution/codec from a media file via ffprobe. Never throws —
 * a file that fails to probe still gets imported, just with unknown metadata,
 * since blocking the whole import on one bad file is worse than a blank field. */
export async function probeMedia(filePath: string): Promise<ProbeResult> {
  try {
    const { stdout } = await execFileAsync(ffprobeStatic.path, [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath
    ])
    const parsed = JSON.parse(stdout) as FfprobeOutput
    const videoStream = parsed.streams?.find((s) => s.codec_type === 'video')

    const durationSec = parsed.format?.duration ? parseFloat(parsed.format.duration) : null
    const durationMs = durationSec && !Number.isNaN(durationSec) ? Math.round(durationSec * 1000) : null

    const resolution =
      videoStream?.width && videoStream?.height ? `${videoStream.width}x${videoStream.height}` : null

    return { durationMs, resolution, codec: videoStream?.codec_name ?? null }
  } catch (err) {
    console.warn(`[probe] failed for ${filePath}:`, (err as Error).message)
    return { durationMs: null, resolution: null, codec: null }
  }
}

/** Extracts a thumbnail frame at ~25% into the clip (or 1s in for short/unknown-duration
 * clips) so we're not just grabbing a black title-card frame at 0:00. */
export async function generateThumbnail(
  filePath: string,
  outputPath: string,
  durationMs: number | null
): Promise<boolean> {
  if (!ffmpegPath) {
    console.warn('[thumbnail] ffmpeg-static path unavailable, skipping')
    return false
  }
  const seekSeconds = durationMs ? Math.max(1, Math.floor((durationMs / 1000) * 0.25)) : 1

  try {
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss',
      String(seekSeconds),
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-vf',
      'scale=320:-1',
      outputPath
    ])
    return true
  } catch (err) {
    console.warn(`[thumbnail] failed for ${filePath}:`, (err as Error).message)
    return false
  }
}
