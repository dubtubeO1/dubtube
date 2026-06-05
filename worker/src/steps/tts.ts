import { uploadToR2 } from '../lib/r2'

export const RACHEL_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'
const MODEL_ID = 'eleven_multilingual_v2'

export interface TTSResult {
  r2Key: string
  voiceId: string
}

/**
 * Generate dubbed audio for a single segment via ElevenLabs TTS.
 *
 * @param text         - The translated text to synthesise
 * @param keyId        - Identifier used in the R2 key (segment index or transcript ID)
 * @param projectId    - Project UUID
 * @param clerkUserId  - Clerk user ID (R2 key prefix)
 * @param voiceId      - ElevenLabs voice ID (defaults to Rachel)
 */
export async function generateSegmentAudio(
  text: string,
  keyId: string,
  projectId: string,
  clerkUserId: string,
  voiceId: string = RACHEL_VOICE_ID,
): Promise<TTSResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY')

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`ElevenLabs TTS error ${response.status}: ${errText}`)
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer())
  const r2Key = `${clerkUserId}/${projectId}/segment/segment_${keyId}.mp3`

  await uploadToR2(r2Key, audioBuffer, 'audio/mpeg')

  return { r2Key, voiceId }
}
