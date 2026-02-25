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

    // Verify ownership via project
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
      typeof (body as Record<string, unknown>).speaker_name !== 'string'
    ) {
      return NextResponse.json({ error: 'speaker_name (string) is required' }, { status: 400 })
    }

    const speakerName = ((body as { speaker_name: string }).speaker_name).trim()
    if (!speakerName) {
      return NextResponse.json({ error: 'speaker_name cannot be empty' }, { status: 400 })
    }

    // Update speaker name in both tables in parallel
    await Promise.all([
      supabaseAdmin
        .from('speakers')
        .update({ speaker_name: speakerName })
        .eq('id', speakerId),
      supabaseAdmin
        .from('transcripts')
        .update({ speaker_name: speakerName })
        .eq('project_id', projectId)
        .eq('speaker_id', speaker.speaker_id),
    ])

    return NextResponse.json({ speakerName })
  } catch (err) {
    console.error('PATCH /api/projects/[projectId]/speakers/[speakerId]', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
