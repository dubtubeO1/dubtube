import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function getDeepLEndpoint(): string {
  const key = process.env.DEEPL_API_KEY ?? ''
  return key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'
}

function mapSourceLang(code: string): string {
  return code.toUpperCase()
}

function mapTargetLang(code: string): string {
  const upper = code.toUpperCase()
  if (upper === 'EN') return 'EN-US'
  if (upper === 'PT') return 'PT-PT'
  return upper
}

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

    const apiKey = process.env.DEEPL_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'DeepL API key not configured' }, { status: 500 })
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
      .select('id, user_id, source_language, target_language')
      .eq('id', projectId)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (project.user_id !== userRow.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!project.target_language) {
      return NextResponse.json({ error: 'Project has no target language' }, { status: 400 })
    }

    // Get the transcript
    const { data: transcript } = await supabaseAdmin
      .from('transcripts')
      .select('id, project_id, original_text')
      .eq('id', transcriptId)
      .single()

    if (!transcript || transcript.project_id !== projectId) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
    }

    if (!transcript.original_text) {
      return NextResponse.json({ error: 'No original text to translate' }, { status: 400 })
    }

    // Call DeepL
    const deeplBody: Record<string, unknown> = {
      text: [transcript.original_text],
      target_lang: mapTargetLang(project.target_language),
    }
    if (project.source_language) {
      deeplBody.source_lang = mapSourceLang(project.source_language)
    }

    const deeplRes = await fetch(getDeepLEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deeplBody),
    })

    if (!deeplRes.ok) {
      const errText = await deeplRes.text()
      console.error('DeepL retranslate error', {
        userId,
        projectId,
        transcriptId,
        status: deeplRes.status,
        body: errText,
      })
      return NextResponse.json({ error: 'Translation failed' }, { status: 502 })
    }

    const deeplData = (await deeplRes.json()) as {
      translations: Array<{ text: string }>
    }

    const translatedText = deeplData.translations[0]?.text ?? ''

    // Save the new translation
    await supabaseAdmin
      .from('transcripts')
      .update({ translated_text: translatedText, updated_at: new Date().toISOString() })
      .eq('id', transcriptId)

    return NextResponse.json({ translated_text: translatedText })
  } catch (err) {
    console.error('POST .../transcripts/[transcriptId]/retranslate', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
