import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { r2, getPresignedReadUrl } from '@/lib/r2'

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel
const ELEVEN_MODEL = 'eleven_multilingual_v2'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; transcriptId: string }> },
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
    }

    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME
    if (!bucketName) {
      return NextResponse.json({ error: 'R2 bucket not configured' }, { status: 500 })
    }

    const { projectId, transcriptId } = await params

    // Verify ownership via project
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, user_id, video_r2_key')
      .eq('id', projectId)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (project.user_id !== userRow.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Get the transcript
    const { data: transcript } = await supabaseAdmin
      .from('transcripts')
      .select('id, project_id, translated_text, voice_id, segment_audio_r2_key')
      .eq('id', transcriptId)
      .single()

    if (!transcript || transcript.project_id !== projectId) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
    }

    if (!transcript.translated_text) {
      return NextResponse.json({ error: 'No translated text to regenerate' }, { status: 400 })
    }

    const voiceId = (transcript.voice_id as string | null) ?? DEFAULT_VOICE_ID

    // Determine R2 key — use existing key or derive a new one from transcript ID
    let r2Key = transcript.segment_audio_r2_key as string | null
    if (!r2Key) {
      const videoR2Key = project.video_r2_key as string | null
      const clerkUserId = videoR2Key?.split('/')[0]
      if (!clerkUserId) {
        return NextResponse.json({ error: 'Could not determine storage path' }, { status: 500 })
      }
      r2Key = `${clerkUserId}/${projectId}/segment/segment_${transcriptId}.mp3`
    }

    // Call ElevenLabs TTS
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: transcript.translated_text,
          model_id: ELEVEN_MODEL,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    )

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text()
      console.error('ElevenLabs TTS error', {
        userId,
        projectId,
        transcriptId,
        status: ttsResponse.status,
        body: errText,
      })
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 502 })
    }

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer())

    await r2.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: r2Key,
        Body: audioBuffer,
        ContentType: 'audio/mpeg',
      }),
    )

    // Persist the key if it was newly assigned
    if (!transcript.segment_audio_r2_key) {
      await supabaseAdmin
        .from('transcripts')
        .update({ segment_audio_r2_key: r2Key })
        .eq('id', transcriptId)
    }

    const url = await getPresignedReadUrl(r2Key, 3600)

    return NextResponse.json({ url })
  } catch (err) {
    console.error('POST .../transcripts/[transcriptId]/regenerate', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
