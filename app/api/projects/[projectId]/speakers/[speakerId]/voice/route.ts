import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; speakerId: string }> },
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const { projectId, speakerId } = await params

    // Verify ownership
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (project.user_id !== userRow.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Verify the speaker belongs to this project
    const { data: speaker } = await supabaseAdmin
      .from('speakers')
      .select('id, project_id, speaker_id')
      .eq('id', speakerId)
      .single()

    if (!speaker || speaker.project_id !== projectId) {
      return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
    }

    const body: unknown = await req.json()
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as Record<string, unknown>).voice_id !== 'string'
    ) {
      return NextResponse.json({ error: 'voice_id (string) is required' }, { status: 400 })
    }

    const voiceId = ((body as { voice_id: string }).voice_id).trim()
    if (!voiceId) {
      return NextResponse.json({ error: 'voice_id cannot be empty' }, { status: 400 })
    }

    // Update speaker voice
    await supabaseAdmin
      .from('speakers')
      .update({ voice_id: voiceId })
      .eq('id', speakerId)

    // Cascade to all transcripts for this speaker: update voice_id, clear segment audio
    await supabaseAdmin
      .from('transcripts')
      .update({ voice_id: voiceId, segment_audio_r2_key: null })
      .eq('project_id', projectId)
      .eq('speaker_id', speaker.speaker_id)

    return NextResponse.json({ voice_id: voiceId })
  } catch (err) {
    console.error('PATCH /api/projects/[projectId]/speakers/[speakerId]/voice', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
