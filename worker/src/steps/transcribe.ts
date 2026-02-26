import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface TranscriptSegment {
  start: number
  end: number
  text: string
  /** Speaker label from diarization, e.g. 'SPEAKER_00'. Null when not available. */
  speaker: string | null
}

export interface TranscribeResult {
  segments: TranscriptSegment[]
  /** ISO 639-1 lowercase code returned by Whisper, e.g. 'en', 'es' */
  detectedLanguage: string
}

export async function transcribeVideo(videoPath: string): Promise<TranscribeResult> {
  const apiKey = process.env.LEMONFOX_API_KEY
  if (!apiKey) throw new Error('Missing LEMONFOX_API_KEY')

  // Extract audio: stereo, 22kHz, 128kbps MP3.
  // Keep stereo and higher quality so the diarization model retains enough acoustic
  // information to distinguish speakers. Mono/16kHz/64kbps strips features that
  // pitch + timbre-based speaker separation depends on.
  const audioPath = path.join(os.tmpdir(), `${path.basename(videoPath, path.extname(videoPath))}_audio.mp3`)

  try {
    await execAsync(
      `ffmpeg -y -i "${videoPath}" -vn -acodec libmp3lame -ar 22050 -ac 2 -b:a 128k "${audioPath}"`,
    )

    const audioBuffer = fs.readFileSync(audioPath)
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })

    const formData = new FormData()
    formData.append('file', audioBlob, 'audio.mp3')
    // Do NOT specify model: Lemonfox routes through their diarization-enabled
    // pipeline by default. Explicitly setting 'whisper-1' hits the base
    // OpenAI-compatible endpoint that skips speaker separation.
    formData.append('response_format', 'verbose_json')
    formData.append('timestamp_granularities[]', 'word')
    formData.append('speaker_labels', 'true')

    const response = await fetch('https://api.lemonfox.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Lemonfox API error ${response.status}: ${errText}`)
    }

    const data = (await response.json()) as {
      language: string
      segments: Array<{ start: number; end: number; text: string; speaker?: string }>
    }

    const segments: TranscriptSegment[] = data.segments
      .map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
        speaker: s.speaker ?? null,
      }))
      .filter((s) => s.text.length > 0)

    return { segments, detectedLanguage: data.language }
  } finally {
    if (fs.existsSync(audioPath)) {
      try { fs.unlinkSync(audioPath) } catch { /* ignore */ }
    }
  }
}
