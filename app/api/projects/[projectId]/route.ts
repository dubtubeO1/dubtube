import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { deleteR2Prefix } from '@/lib/r2'

// ─── Shared ownership verification ──────────────────────────────────────────

async function resolveOwnership(
  clerkUserId: string,
  projectId: string,
): Promise<
  | { ok: true; supabaseUserId: string }
  | { ok: false; response: NextResponse }
> {
  if (!supabaseAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }),
    }
  }

  const { data: userRow, error: userError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (userError || !userRow) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'User not found' }, { status: 404 }),
    }
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Project not found' }, { status: 404 }),
    }
  }

  if (project.user_id !== userRow.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true, supabaseUserId: userRow.id }
}

// ─── GET /api/projects/[projectId] ──────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId } = await params
    const ownership = await resolveOwnership(userId, projectId)
    if (!ownership.ok) return ownership.response

    const [projectResult, transcriptsResult, speakersResult] = await Promise.all([
      supabaseAdmin!.from('projects').select('*').eq('id', projectId).single(),
      supabaseAdmin!
        .from('transcripts')
        .select('*')
        .eq('project_id', projectId)
        .order('start_time', { ascending: true }),
      supabaseAdmin!
        .from('speakers')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true }),
    ])

    if (projectResult.error || !projectResult.data) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({
      project: projectResult.data,
      transcripts: transcriptsResult.data ?? [],
      speakers: speakersResult.data ?? [],
    })
  } catch (err) {
    console.error('Unexpected error in GET /api/projects/[projectId]', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── PATCH /api/projects/[projectId] ────────────────────────────────────────

const PATCHABLE_FIELDS = new Set([
  'status',
  'title',
  'source_language',
  'target_language',
  'audio_r2_key',
  'dubbed_audio_r2_key',
  'error_message',
])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId } = await params
    const ownership = await resolveOwnership(userId, projectId)
    if (!ownership.ok) return ownership.response

    const body: unknown = await req.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (PATCHABLE_FIELDS.has(key)) {
        updates[key] = value
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const { data: updated, error } = await supabaseAdmin!
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .single()

    if (error || !updated) {
      console.error('Error updating project', { userId, projectId, error })
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
    }

    return NextResponse.json({ project: updated })
  } catch (err) {
    console.error('Unexpected error in PATCH /api/projects/[projectId]', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE /api/projects/[projectId] ───────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId } = await params
    const ownership = await resolveOwnership(userId, projectId)
    if (!ownership.ok) return ownership.response

    // Delete all R2 files for this project.
    // R2 errors are logged but do not block DB deletion —
    // we never want a failed R2 call to permanently strand a project record.
    try {
      await deleteR2Prefix(`${userId}/${projectId}/`)
    } catch (r2Err) {
      console.error('R2 deletion failed during project delete (continuing)', {
        userId,
        projectId,
        error: r2Err,
      })
    }

    // Delete the project row — cascades to transcripts + speakers via FK
    const { error: deleteError } = await supabaseAdmin!
      .from('projects')
      .delete()
      .eq('id', projectId)

    if (deleteError) {
      console.error('Error deleting project from Supabase', { userId, projectId, error: deleteError })
      return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in DELETE /api/projects/[projectId]', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
