import type { ScheduleBlockWithMedia } from '@shared/types'

// A fixed broadcast-standard canvas. Every clip is scaled to fit inside this
// (preserving aspect ratio) and letterboxed/pillarboxed to fill it exactly —
// never stretched, since distorting a submitter's video is not acceptable
// for a community station. This also means every clip presents the same
// dimensions to the concat filter, which is what makes concatenating
// heterogeneous source material (your community's mixed-quality uploads)
// actually work.
const CANVAS_WIDTH = 1920
const CANVAS_HEIGHT = 1080
const CANVAS_FPS = 30
const AUDIO_SAMPLE_RATE = 44100

export interface ConcatPlan {
  /** -i arguments, in order (one per block). */
  inputArgs: string[]
  /** The full -filter_complex graph. */
  filterComplex: string
  /** -map arguments for the filter graph's final labeled outputs. */
  mapArgs: string[]
}

/**
 * Builds a single ffmpeg filter graph that plays every block in order and
 * concatenates them into one continuous output stream — this is what lets
 * one long-running ffmpeg process cover an entire broadcast session instead
 * of reconnecting to the RTMP destination between every item.
 */
export function buildConcatPlan(blocks: ScheduleBlockWithMedia[]): ConcatPlan {
  if (blocks.length === 0) throw new Error('Cannot build a concat plan with no blocks')

  const inputArgs: string[] = []
  const perClipFilters: string[] = []
  const concatInputs: string[] = []

  blocks.forEach((block, i) => {
    // Deliberately NOT using -re here. -re paces an input's reads to real
    // time, but it's a per-input flag — with multiple inputs in one command,
    // ffmpeg starts pacing ALL of them in real time from the moment the
    // process launches, not just whichever one concat is currently playing.
    // That means clip 2 is already being read/buffered in real time while
    // clip 1 is still playing, so by the time concat actually switches to
    // clip 2, it's already partway buffered — clip 2 doesn't start from its
    // beginning, it starts partway in. That's what "skipping to clips"
    // turned out to be. Real-time pacing needs to happen on the combined
    // OUTPUT after concat has sequenced the clips, not on each input before
    // concat gets to them — see the realtime/arealtime filters below.
    inputArgs.push('-i', block.media.filePath)

    // Scale to fit inside the canvas, pad to fill it exactly, normalize pixel
    // format/aspect ratio/frame rate so every clip's video stream is
    // completely identical in shape, format, and timing before concat joins
    // them. format=yuv420p matters as much as the others: different source
    // clips (different cameras, screen recorders, encoders) can carry
    // different pixel formats, and concat combining frames of inconsistent
    // pixel format is a real, documented source of visual corruption right
    // at the transition point — not just a theoretical concern.
    perClipFilters.push(
      `[${i}:v]scale=${CANVAS_WIDTH}:${CANVAS_HEIGHT}:force_original_aspect_ratio=decrease,` +
        `pad=${CANVAS_WIDTH}:${CANVAS_HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1,fps=${CANVAS_FPS},setpts=PTS-STARTPTS[v${i}]`
    )
    // Normalize audio format too — source clips won't all agree on sample
    // rate, mono/stereo, or sample format (fltp vs s16 etc.) — our own test
    // clips were mono while real-world uploads are commonly stereo at
    // 48kHz, and a mismatched sample format specifically tends to show up
    // as audible clicks/pops right at each transition.
    perClipFilters.push(
      `[${i}:a]aformat=sample_rates=${AUDIO_SAMPLE_RATE}:channel_layouts=stereo:sample_fmts=fltp,asetpts=PTS-STARTPTS[a${i}]`
    )
    concatInputs.push(`[v${i}][a${i}]`)
  })

  // realtime/arealtime pace the already-concatenated, already-correctly-
  // sequenced output stream to real time — the right place for this pacing
  // to happen, unlike -re on each input above.
  const concatFilter =
    `${concatInputs.join('')}concat=n=${blocks.length}:v=1:a=1[cv][ca];` +
    `[cv]realtime[outv];[ca]arealtime[outa]`
  const filterComplex = [...perClipFilters, concatFilter].join(';')

  return {
    inputArgs,
    filterComplex,
    mapArgs: ['-map', '[outv]', '-map', '[outa]']
  }
}
