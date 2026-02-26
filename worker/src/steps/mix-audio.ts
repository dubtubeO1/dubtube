import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { downloadFromR2, uploadToR2 } from '../lib/r2'

const execAsync = promisify(exec)

interface SegmentInput {
  id: string
  start_time: number | null
  end_time: number | null
  segment_audio_r2_key: string | null
  duration_match: boolean
}

/**
 * Mix all dubbed segment audio files into a single audio track.
 *
 * Strategy:
 *  1. Build a silent base track of total video duration.
 *  2. For each segment with a valid audio key:
 *     - If duration_match=true: apply atempo to stretch/compress the clip
 *       to exactly fill [start_time, end_time].
 *     - Place the (optionally time-adjusted) clip at start_time using adelay.
 *  3. amix all inputs (silent base + delayed clips) into a single stereo track.
 *  4. Upload the result to R2 and return the key.
 */
export async function mixDubbedAudio(
  segments: SegmentInput[],
  videoDurationSeconds: number | null,
  projectId: string,
  clerkUserId: string,
): Promise<string> {
  const workDir = path.join(os.tmpdir(), `mix_${projectId}`)
  fs.mkdirSync(workDir, { recursive: true })

  try {
    // Download all segment audio files in parallel
    const segmentFiles: string[] = []
    await Promise.all(
      segments.map(async (seg, i) => {
        if (!seg.segment_audio_r2_key) return
        const localPath = path.join(workDir, `seg_${i}.mp3`)
        const buf = await downloadFromR2(seg.segment_audio_r2_key)
        fs.writeFileSync(localPath, buf)
        segmentFiles[i] = localPath
      }),
    )

    // Determine total duration for the silent base track.
    // Fall back to the end_time of the last segment + 1 second if not probed.
    let totalDuration = videoDurationSeconds
    if (!totalDuration || totalDuration <= 0) {
      const lastEnd = Math.max(
        ...segments.map((s) => (s.end_time ?? 0)),
        0,
      )
      totalDuration = lastEnd + 1
    }

    // Build silent base track
    const silencePath = path.join(workDir, 'silence.mp3')
    await execAsync(
      `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${totalDuration} "${silencePath}"`,
    )

    // Build ffmpeg filter_complex input list and filter graph
    // Input 0 is always the silence base; inputs 1..N are the segment clips.
    const inputArgs: string[] = [`-i "${silencePath}"`]
    const filterParts: string[] = []
    const mixInputs: string[] = ['[0:a]']

    let inputIndex = 1
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const localFile = segmentFiles[i]
      if (!localFile || seg.start_time === null) continue

      const delayMs = Math.round(seg.start_time * 1000)

      inputArgs.push(`-i "${localFile}"`)

      if (seg.duration_match && seg.end_time !== null && seg.end_time > seg.start_time) {
        // Probe actual audio duration to calculate the atempo ratio
        let clipDuration: number | null = null
        try {
          const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${localFile}"`,
          )
          clipDuration = parseFloat(stdout.trim())
          if (isNaN(clipDuration)) clipDuration = null
        } catch {
          clipDuration = null
        }

        if (clipDuration && clipDuration > 0) {
          const targetDuration = seg.end_time - seg.start_time
          let ratio = clipDuration / targetDuration

          // atempo only accepts values in [0.5, 100.0].
          // Chain multiple atempo filters if needed.
          const atempoFilters = buildAtempoChain(ratio)

          filterParts.push(
            `[${inputIndex}:a]${atempoFilters},adelay=${delayMs}|${delayMs}[a${inputIndex}]`,
          )
        } else {
          filterParts.push(`[${inputIndex}:a]adelay=${delayMs}|${delayMs}[a${inputIndex}]`)
        }
      } else {
        filterParts.push(`[${inputIndex}:a]adelay=${delayMs}|${delayMs}[a${inputIndex}]`)
      }

      mixInputs.push(`[a${inputIndex}]`)
      inputIndex++
    }

    const outputPath = path.join(workDir, 'dubbed.mp3')

    if (mixInputs.length === 1) {
      // No valid segments — output just the silence track
      await execAsync(
        `ffmpeg -y -i "${silencePath}" -c:a libmp3lame -b:a 128k "${outputPath}"`,
      )
    } else {
      const filterComplex =
        filterParts.join(';') +
        (filterParts.length > 0 ? ';' : '') +
        `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0[aout]`

      const inputStr = inputArgs.join(' ')
      await execAsync(
        `ffmpeg -y ${inputStr} -filter_complex "${filterComplex}" -map "[aout]" -c:a libmp3lame -b:a 128k "${outputPath}"`,
      )
    }

    // Upload to R2
    const r2Key = `${clerkUserId}/${projectId}/dubbed/dubbed_audio.mp3`
    const outputBuf = fs.readFileSync(outputPath)
    await uploadToR2(r2Key, outputBuf, 'audio/mpeg')

    return r2Key
  } finally {
    // Clean up temp dir
    try {
      fs.rmSync(workDir, { recursive: true, force: true })
    } catch { /* ignore */ }
  }
}

/**
 * Build a chain of atempo filters to achieve a target ratio.
 * atempo only accepts [0.5, 100.0]; chain filters for extreme values.
 */
function buildAtempoChain(ratio: number): string {
  // Clamp to a reasonable range to avoid extreme stretching
  const clamped = Math.max(0.25, Math.min(4.0, ratio))

  if (clamped >= 0.5 && clamped <= 2.0) {
    return `atempo=${clamped.toFixed(4)}`
  }

  if (clamped < 0.5) {
    // e.g. ratio=0.25 → atempo=0.5,atempo=0.5
    return `atempo=0.5,atempo=${(clamped / 0.5).toFixed(4)}`
  }

  // clamped > 2.0, e.g. ratio=3.0 → atempo=2.0,atempo=1.5
  return `atempo=2.0,atempo=${(clamped / 2.0).toFixed(4)}`
}
