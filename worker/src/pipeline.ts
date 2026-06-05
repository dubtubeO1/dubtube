import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as Sentry from '@sentry/node'
import { getSupabaseAdmin } from './lib/supabase'
import { downloadFromR2, uploadToR2 } from './lib/r2'
import { transcribeVideo } from './steps/transcribe'
import { translateSegments } from './steps/translate'
import { generateSegmentAudio, RACHEL_VOICE_ID } from './steps/tts'
import { mixDubbedAudio, concatDubbedAudio } from './steps/mix-audio'

type ProjectStatus =
  | 'uploading'
  | 'ready'
  | 'queued'
  | 'transcribing'
  | 'translating'
  | 'generating_audio'
  | 'completed'
  | 'delivering'
  | 'delivered'
  | 'error'

const execAsync = promisify(exec)

async function setStatus(
  projectId: string,
  status: ProjectStatus,
  extra?: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('projects')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', projectId)
}

// ── ffprobe duration helper ───────────────────────────────────────────────────

async function probeDuration(videoPath: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
    )
    const parsed = parseFloat(stdout.trim())
    return isNaN(parsed) ? null : parsed
  } catch {
    return null
  }
}

// ── Extract and concat audio for one speaker ─────────────────────────────────
//
// Extracts each segment's audio from the source video using ffmpeg, writes them
// to temp wav files, concatenates them, and returns the combined mp3 as a Buffer.

interface SegmentSlice {
  start: number
  end: number
}

async function extractSpeakerAudio(
  videoPath: string,
  segments: SegmentSlice[],
  tmpDir: string,
  speakerId: string,
): Promise<Buffer> {
  const segmentFiles: string[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const outPath = path.join(tmpDir, `${speakerId}_seg_${i}.wav`)
    await execAsync(
      `ffmpeg -y -ss ${seg.start} -to ${seg.end} -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${outPath}"`,
    )
    segmentFiles.push(outPath)
  }

  // Concat all segments
  const listPath = path.join(tmpDir, `${speakerId}_list.txt`)
  const listContent = segmentFiles.map((f) => `file '${f}'`).join('\n')
  fs.writeFileSync(listPath, listContent)

  const concatPath = path.join(tmpDir, `${speakerId}_combined.mp3`)
  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -acodec libmp3lame -q:a 2 "${concatPath}"`,
  )

  const buffer = fs.readFileSync(concatPath)

  // Clean up segment files and list
  for (const f of segmentFiles) {
    try { fs.unlinkSync(f) } catch { /* ignore */ }
  }
  try { fs.unlinkSync(listPath) } catch { /* ignore */ }
  try { fs.unlinkSync(concatPath) } catch { /* ignore */ }

  return buffer
}

// ── ElevenLabs Instant Voice Cloning ─────────────────────────────────────────

async function cloneVoice(audioBuffer: Buffer, displayName: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY')

  const formData = new FormData()
  formData.append('name', displayName)
  const blob = new Blob([audioBuffer], { type: 'audio/mpeg' })
  formData.append('files', blob, `${displayName}.mp3`)

  const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`ElevenLabs IVC error ${response.status}: ${errText}`)
  }

  const data = (await response.json()) as { voice_id: string }
  if (!data.voice_id) throw new Error('ElevenLabs IVC response missing voice_id')
  return data.voice_id
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runPipeline(projectId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  let videoPath: string | null = null
  let tmpDir: string | null = null

  try {
    // ── Fetch project ──────────────────────────────────────────────────────
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, title, video_r2_key, source_language, target_language')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      throw new Error('Project not found')
    }

    const { video_r2_key, source_language, target_language } = project as {
      video_r2_key: string | null
      source_language: string | null
      target_language: string | null
    }

    if (!video_r2_key) throw new Error('Project has no video_r2_key')
    if (!target_language) throw new Error('Project has no target_language')

    // Derive clerk_user_id from R2 key prefix (avoids extra DB lookup)
    const clerkUserId = video_r2_key.split('/')[0]
    if (!clerkUserId) throw new Error('Could not derive clerkUserId from video_r2_key')

    // ── Download video ─────────────────────────────────────────────────────
    const ext = path.extname(video_r2_key.split('/').pop() ?? '') || '.mp4'
    videoPath = path.join(os.tmpdir(), `${projectId}_video${ext}`)
    tmpDir = path.join(os.tmpdir(), `${projectId}_clone`)
    fs.mkdirSync(tmpDir, { recursive: true })

    console.log(`[${projectId}] Downloading video from R2...`)
    const videoBuffer = await downloadFromR2(video_r2_key)
    fs.writeFileSync(videoPath, videoBuffer)
    console.log(`[${projectId}] Video downloaded (${videoBuffer.length} bytes)`)

    // ── Probe duration ─────────────────────────────────────────────────────
    const videoDuration = await probeDuration(videoPath)
    if (videoDuration !== null) {
      console.log(`[${projectId}] Video duration: ${videoDuration.toFixed(2)}s`)
      await supabase
        .from('projects')
        .update({ video_duration_seconds: videoDuration, updated_at: new Date().toISOString() })
        .eq('id', projectId)
    }

    // ── Transcribing ───────────────────────────────────────────────────────
    await setStatus(projectId, 'transcribing')
    console.log(`[${projectId}] Transcribing...`)

    const { segments, detectedLanguage } = await transcribeVideo(videoPath)
    console.log(`[${projectId}] Transcribed ${segments.length} segments, language: ${detectedLanguage}`)

    const effectiveSourceLang = source_language ?? detectedLanguage.toUpperCase()
    if (!source_language) {
      await supabase
        .from('projects')
        .update({ source_language: effectiveSourceLang, updated_at: new Date().toISOString() })
        .eq('id', projectId)
    }

    if (segments.length === 0) {
      throw new Error('Transcription returned no segments — the audio may be silent or unrecognisable')
    }

    // ── Translating ────────────────────────────────────────────────────────
    await setStatus(projectId, 'translating')
    console.log(`[${projectId}] Translating ${segments.length} segments...`)

    const texts = segments.map((s) => s.text)
    const translatedTexts = await translateSegments(texts, effectiveSourceLang, target_language)

    // ── Voice cloning (uses generating_audio status) ───────────────────────
    await setStatus(projectId, 'generating_audio')
    console.log(`[${projectId}] Setting up speaker voices...`)

    // Group segments by speaker and calculate total duration per speaker
    const uniqueSpeakerIds = [...new Set(segments.map((s) => s.speaker ?? 'SPEAKER_00'))]

    const speakerVoiceMap: Record<string, string> = {}          // speakerId → voice_id for TTS
    const speakerClonedIdMap: Record<string, string | null> = {} // speakerId → el_cloned_voice_id
    const speakerCloneErrorMap: Record<string, string | null> = {} // speakerId → clone_error
    const speakerIsClonedMap: Record<string, boolean> = {}

    for (const speakerId of uniqueSpeakerIds) {
      const speakerSegments = segments
        .map((s, i) => ({ ...s, index: i }))
        .filter((s) => (s.speaker ?? 'SPEAKER_00') === speakerId)

      const totalDuration = speakerSegments.reduce((sum, s) => sum + (s.end - s.start), 0)
      console.log(`[${projectId}] Speaker ${speakerId}: ${totalDuration.toFixed(1)}s total audio`)

      if (totalDuration >= 60) {
        try {
          const slices: SegmentSlice[] = speakerSegments.map((s) => ({
            start: s.start,
            end: s.end,
          }))
          const audioBuffer = await extractSpeakerAudio(videoPath, slices, tmpDir, speakerId)

          const r2Key = `${clerkUserId}/${projectId}/audio/${speakerId}_source.mp3`
          await uploadToR2(r2Key, audioBuffer, 'audio/mpeg')

          const elVoiceId = await cloneVoice(audioBuffer, `${projectId}_${speakerId}`)
          console.log(`[${projectId}] Cloned voice for ${speakerId}: ${elVoiceId}`)

          speakerVoiceMap[speakerId] = elVoiceId
          speakerClonedIdMap[speakerId] = elVoiceId
          speakerIsClonedMap[speakerId] = true
          speakerCloneErrorMap[speakerId] = null
        } catch (cloneErr) {
          const errMsg = cloneErr instanceof Error ? cloneErr.message : String(cloneErr)
          console.error(`[${projectId}] Voice cloning failed for ${speakerId}:`, errMsg)
          Sentry.captureException(cloneErr, { extra: { projectId, speakerId } })

          speakerVoiceMap[speakerId] = RACHEL_VOICE_ID
          speakerClonedIdMap[speakerId] = null
          speakerIsClonedMap[speakerId] = false
          speakerCloneErrorMap[speakerId] = errMsg
        }
      } else {
        console.log(`[${projectId}] Speaker ${speakerId}: insufficient audio for cloning (<60s), using Rachel`)
        speakerVoiceMap[speakerId] = RACHEL_VOICE_ID
        speakerClonedIdMap[speakerId] = null
        speakerIsClonedMap[speakerId] = false
        speakerCloneErrorMap[speakerId] = null
      }
    }

    // Insert speaker rows
    const speakerRows = uniqueSpeakerIds.map((speakerId) => ({
      project_id: projectId,
      speaker_id: speakerId,
      speaker_name: speakerId,
      voice_id: speakerVoiceMap[speakerId] ?? RACHEL_VOICE_ID,
      is_cloned: speakerIsClonedMap[speakerId] ?? false,
      el_cloned_voice_id: speakerClonedIdMap[speakerId] ?? null,
      clone_error: speakerCloneErrorMap[speakerId] ?? null,
    }))

    const { error: speakersInsertError } = await supabase.from('speakers').insert(speakerRows)
    if (speakersInsertError) {
      throw new Error(`Failed to insert speakers: ${speakersInsertError.message}`)
    }
    console.log(`[${projectId}] Created ${uniqueSpeakerIds.length} speaker(s)`)

    // Build transcript rows — no TTS, segment_audio_r2_key left null (generated on deliver)
    const transcriptRows: Record<string, unknown>[] = []
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      const translatedText = translatedTexts[i] ?? ''
      const speakerId = segment.speaker ?? 'SPEAKER_00'

      transcriptRows.push({
        project_id: projectId,
        speaker_id: speakerId,
        speaker_name: speakerId,
        start_time: segment.start,
        end_time: segment.end,
        original_text: segment.text,
        translated_text: translatedText,
        segment_audio_r2_key: null,
        voice_id: speakerVoiceMap[speakerId] ?? RACHEL_VOICE_ID,
        is_cloned: speakerIsClonedMap[speakerId] ?? false,
        duration_match: true,
      })
    }

    const { error: insertError } = await supabase.from('transcripts').insert(transcriptRows)
    if (insertError) {
      throw new Error(`Failed to insert transcripts: ${insertError.message}`)
    }

    // ── Complete ───────────────────────────────────────────────────────────
    await setStatus(projectId, 'completed')
    console.log(`[${projectId}] Pipeline complete`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${projectId}] Pipeline failed:`, message)
    Sentry.captureException(err, { extra: { projectId } })

    try {
      await setStatus(projectId, 'error', { error_message: message })
    } catch (updateErr) {
      console.error(`[${projectId}] Failed to write error status:`, updateErr)
    }
  } finally {
    if (videoPath && fs.existsSync(videoPath)) {
      try { fs.unlinkSync(videoPath) } catch { /* ignore */ }
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }
}

// ── Remix pipeline (reorder segments, sequential concatenation) ───────────────

export async function runRemix(projectId: string, segmentOrder: string[]): Promise<void> {
  const supabase = getSupabaseAdmin()

  try {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, video_r2_key')
      .eq('id', projectId)
      .single()

    if (projectError || !project) throw new Error('Project not found')

    const { video_r2_key } = project as { video_r2_key: string | null }
    if (!video_r2_key) throw new Error('Project has no video_r2_key')

    const clerkUserId = video_r2_key.split('/')[0]
    if (!clerkUserId) throw new Error('Could not derive clerkUserId from video_r2_key')

    const { data: transcripts, error: transcriptsError } = await supabase
      .from('transcripts')
      .select('id, segment_audio_r2_key')
      .in('id', segmentOrder)
      .eq('project_id', projectId)

    if (transcriptsError || !transcripts) throw new Error('Failed to fetch transcripts')

    const transcriptMap = new Map(
      (transcripts as Array<{ id: string; segment_audio_r2_key: string | null }>).map((t) => [
        t.id,
        t,
      ]),
    )

    const orderedSegments = segmentOrder
      .map((id) => transcriptMap.get(id))
      .filter(
        (s): s is { id: string; segment_audio_r2_key: string } =>
          s != null && typeof s.segment_audio_r2_key === 'string',
      )

    if (orderedSegments.length === 0) throw new Error('No segments with audio found')

    console.log(`[${projectId}] Remixing ${orderedSegments.length} segment(s) in custom order...`)

    const dubbedR2Key = await concatDubbedAudio(orderedSegments, projectId, clerkUserId)

    await supabase
      .from('projects')
      .update({
        status: 'delivered',
        dubbed_audio_r2_key: dubbedR2Key,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    console.log(`[${projectId}] Remix complete — r2Key: ${dubbedR2Key}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${projectId}] Remix failed:`, message)
    try {
      await supabase
        .from('projects')
        .update({ status: 'error', error_message: message, updated_at: new Date().toISOString() })
        .eq('id', projectId)
    } catch (updateErr) {
      console.error(`[${projectId}] Failed to write error status:`, updateErr)
    }
  }
}

// ── Deliver pipeline ──────────────────────────────────────────────────────────

export async function runDeliver(projectId: string): Promise<void> {
  const supabase = getSupabaseAdmin()

  try {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, video_r2_key, video_duration_seconds')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      throw new Error('Project not found')
    }

    const { video_r2_key, video_duration_seconds } = project as {
      video_r2_key: string | null
      video_duration_seconds: number | null
    }

    if (!video_r2_key) throw new Error('Project has no video_r2_key')

    const clerkUserId = video_r2_key.split('/')[0]
    if (!clerkUserId) throw new Error('Could not derive clerkUserId from video_r2_key')

    // Fetch transcripts including voice_id and translated_text for on-demand TTS
    const { data: transcripts, error: transcriptsError } = await supabase
      .from('transcripts')
      .select('id, start_time, end_time, segment_audio_r2_key, duration_match, voice_id, translated_text')
      .eq('project_id', projectId)
      .order('start_time', { ascending: true })

    if (transcriptsError || !transcripts) {
      throw new Error('Failed to fetch transcripts')
    }

    type TranscriptForDeliver = {
      id: string
      start_time: number | null
      end_time: number | null
      segment_audio_r2_key: string | null
      duration_match: boolean
      voice_id: string | null
      translated_text: string | null
    }

    const segments = transcripts as TranscriptForDeliver[]

    // ── Generate missing segment audio ─────────────────────────────────────
    const missing = segments.filter((s) => !s.segment_audio_r2_key)
    if (missing.length > 0) {
      console.log(`[${projectId}] Generating TTS for ${missing.length} segment(s) without audio...`)
      for (const segment of missing) {
        if (!segment.translated_text) {
          console.warn(`[${projectId}] Segment ${segment.id} has no translated text, skipping`)
          continue
        }
        const voiceId = segment.voice_id ?? RACHEL_VOICE_ID
        const { r2Key } = await generateSegmentAudio(
          segment.translated_text,
          segment.id,
          projectId,
          clerkUserId,
          voiceId,
        )
        await supabase
          .from('transcripts')
          .update({ segment_audio_r2_key: r2Key })
          .eq('id', segment.id)
        segment.segment_audio_r2_key = r2Key
        console.log(`[${projectId}] Generated audio for segment ${segment.id}`)
      }
    }

    console.log(`[${projectId}] Mixing ${segments.length} segment(s)...`)

    // ── Mix dubbed audio ───────────────────────────────────────────────────
    const dubbedR2Key = await mixDubbedAudio(
      segments as Array<{ id: string; start_time: number | null; end_time: number | null; segment_audio_r2_key: string | null; duration_match: boolean }>,
      video_duration_seconds,
      projectId,
      clerkUserId,
    )

    await supabase
      .from('projects')
      .update({
        status: 'delivered',
        dubbed_audio_r2_key: dubbedR2Key,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    console.log(`[${projectId}] Deliver complete — r2Key: ${dubbedR2Key}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${projectId}] Deliver failed:`, message)
    Sentry.captureException(err, { extra: { projectId } })

    try {
      await supabase
        .from('projects')
        .update({
          status: 'error',
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
    } catch (updateErr) {
      console.error(`[${projectId}] Failed to write error status:`, updateErr)
    }
  }
}
