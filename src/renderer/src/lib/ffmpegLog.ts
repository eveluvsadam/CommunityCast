export interface FfmpegProgress {
  fps: number | null
  speed: number | null
  time: string | null
}

/** Scans a log tail (newest last) for the most recent ffmpeg progress line
 * and extracts fps/speed/time — this is what lets the UI show "is it
 * actually keeping up" rather than just "a process is running". */
export function parseLatestFfmpegProgress(lines: string[]): FfmpegProgress | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line.includes('frame=') || !line.includes('speed=')) continue
    const fpsMatch = line.match(/fps=\s*([\d.]+)/)
    const speedMatch = line.match(/speed=\s*([\d.]+)x/)
    const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)/)
    return {
      fps: fpsMatch ? parseFloat(fpsMatch[1]) : null,
      speed: speedMatch ? parseFloat(speedMatch[1]) : null,
      time: timeMatch ? timeMatch[1] : null
    }
  }
  return null
}
