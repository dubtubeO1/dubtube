import { uploadToR2 } from '../lib/r2'

const VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // ElevenLabs: Rachel
const MODEL_ID = 'eleven_multilingual_v2'

export interface TTSResult {
  r2Key: string
  voiceId: string
}

export async function generateSegmentAudio(
  text: string,
  segmentIndex: number,
  projectId: string,
  clerkUserId: string,
): Promise<TTSResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY')

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
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
    throw new Error(`ElevenLabs API error ${response.status}: ${errText}`)
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer())
  const r2Key = `${clerkUserId}/${projectId}/segment/segment_${segmentIndex}.mp3`

  await uploadToR2(r2Key, audioBuffer, 'audio/mpeg')

  return { r2Key, voiceId: VOICE_ID }
}
