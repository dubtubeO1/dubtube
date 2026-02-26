import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const PATCHABLE_FIELDS = new Set(['original_text', 'translated_text', 'duration_match'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; transcriptId: string }> },
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
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
      .select('id, user_id')
      .eq('id', projectId)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (project.user_id !== userRow.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Verify the transcript belongs to this project
    const { data: existing } = await supabaseAdmin
      .from('transcripts')
      .select('id, project_id')
      .eq('id', transcriptId)
      .single()

    if (!existing || existing.project_id !== projectId) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
    }

    const body: unknown = await req.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (PATCHABLE_FIELDS.has(key)) updates[key] = value
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const { data: updated, error } = await supabaseAdmin
      .from('transcripts')
      .update(updates)
      .eq('id', transcriptId)
      .select()
      .single()

    if (error || !updated) {
      console.error('Failed to update transcript', { userId, projectId, transcriptId, error })
      return NextResponse.json({ error: 'Failed to update transcript' }, { status: 500 })
    }

    return NextResponse.json({ transcript: updated })
  } catch (err) {
    console.error('PATCH /api/projects/[projectId]/transcripts/[transcriptId]', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
