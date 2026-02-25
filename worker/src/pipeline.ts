import fs from 'fs'
import path from 'path'
import os from 'os'
import { getSupabaseAdmin } from './lib/supabase'
import { downloadFromR2 } from './lib/r2'
import { transcribeVideo } from './steps/transcribe'
import { translateSegments } from './steps/translate'
import { generateSegmentAudio } from './steps/tts'

type ProjectStatus =
  | 'uploading'
  | 'ready'
  | 'queued'
  | 'transcribing'
  | 'translating'
  | 'generating_audio'
  | 'completed'
  | 'error'

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

export async function runPipeline(projectId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  let videoPath: string | null = null

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

    const { video_r2_key, source_language, target_language, user_id } = project as {
      video_r2_key: string | null
      source_language: string | null
      target_language: string | null
      user_id: string
    }

    if (!video_r2_key) throw new Error('Project has no video_r2_key')
    if (!target_language) throw new Error('Project has no target_language')

    // Derive clerk_user_id from R2 key prefix (avoids extra DB lookup)
    // Key format: {clerkUserId}/{projectId}/video/{filename}
    const clerkUserId = video_r2_key.split('/')[0]
    if (!clerkUserId) throw new Error('Could not derive clerkUserId from video_r2_key')

    // ── Download video ─────────────────────────────────────────────────────
    const ext = path.extname(video_r2_key.split('/').pop() ?? '') || '.mp4'
    videoPath = path.join(os.tmpdir(), `${projectId}_video${ext}`)

    console.log(`[${projectId}] Downloading video from R2...`)
    const videoBuffer = await downloadFromR2(video_r2_key)
    fs.writeFileSync(videoPath, videoBuffer)
    console.log(`[${projectId}] Video downloaded (${videoBuffer.length} bytes)`)

    // ── Transcribing ───────────────────────────────────────────────────────
    await setStatus(projectId, 'transcribing')
    console.log(`[${projectId}] Transcribing...`)

    const { segments, detectedLanguage } = await transcribeVideo(videoPath)
    console.log(`[${projectId}] Transcribed ${segments.length} segments, language: ${detectedLanguage}`)

    // Resolve effective source language (use detected if user chose auto-detect)
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

    // ── Generating audio ───────────────────────────────────────────────────
    await setStatus(projectId, 'generating_audio')
    console.log(`[${projectId}] Generating TTS for ${segments.length} segments...`)

    // Build speaker rows — one per unique speaker label returned by diarization.
    // Preserves insertion order so SPEAKER_00 is always the first speaker.
    const uniqueSpeakerIds = [
      ...new Set(segments.map((s) => s.speaker ?? 'SPEAKER_00')),
    ]
    const speakerRows = uniqueSpeakerIds.map((speakerId) => ({
      project_id: projectId,
      speaker_id: speakerId,
      speaker_name: speakerId, // default display name — user can rename in editor
      voice_id: '21m00Tcm4TlvDq8ikWAM',
      is_cloned: false,
    }))

    const { error: speakersInsertError } = await supabase
      .from('speakers')
      .insert(speakerRows)

    if (speakersInsertError) {
      throw new Error(`Failed to insert speakers: ${speakersInsertError.message}`)
    }

    console.log(`[${projectId}] Created ${uniqueSpeakerIds.length} speaker(s): ${uniqueSpeakerIds.join(', ')}`)

    // Generate TTS per segment and collect transcript rows
    const transcriptRows: Record<string, unknown>[] = []
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      const translatedText = translatedTexts[i] ?? ''
      const speakerId = segment.speaker ?? 'SPEAKER_00'

      console.log(`[${projectId}] TTS segment ${i + 1}/${segments.length}`)
      const { r2Key, voiceId } = await generateSegmentAudio(
        translatedText,
        i,
        projectId,
        clerkUserId,
      )

      transcriptRows.push({
        project_id: projectId,
        speaker_id: speakerId,
        speaker_name: speakerId,
        start_time: segment.start,
        end_time: segment.end,
        original_text: segment.text,
        translated_text: translatedText,
        segment_audio_r2_key: r2Key,
        voice_id: voiceId,
        is_cloned: false,
      })
    }

    // Batch insert all transcript rows
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

    try {
      await setStatus(projectId, 'error', { error_message: message })
    } catch (updateErr) {
      console.error(`[${projectId}] Failed to write error status:`, updateErr)
    }
  } finally {
    if (videoPath && fs.existsSync(videoPath)) {
      try { fs.unlinkSync(videoPath) } catch { /* ignore */ }
    }
  }
}
