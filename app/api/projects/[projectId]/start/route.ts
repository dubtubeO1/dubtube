import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const { projectId } = await params

    const body: unknown = await req.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { source_language, target_language } = body as {
      source_language?: string | null
      target_language?: string
    }

    if (!target_language) {
      return NextResponse.json({ error: 'target_language is required' }, { status: 400 })
    }

    // Verify ownership
    const { data: userRow, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !userRow) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.user_id !== userRow.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Mark as queued with language settings
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      .update({
        source_language: source_language ?? null,
        target_language,
        status: 'queued',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    if (updateError) {
      console.error('Failed to queue project', { userId, projectId, error: updateError })
      return NextResponse.json({ error: 'Failed to queue project' }, { status: 500 })
    }

    // Trigger worker (two attempts)
    const workerUrl = process.env.WORKER_URL
    const workerSecret = process.env.WORKER_SECRET

    if (!workerUrl || !workerSecret) {
      await supabaseAdmin
        .from('projects')
        .update({
          status: 'error',
          error_message: 'Worker service is not configured',
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
      return NextResponse.json({ error: 'Worker not configured' }, { status: 503 })
    }

    let triggered = false
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(`${workerUrl}/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${workerSecret}`,
          },
          body: JSON.stringify({ projectId }),
          signal: AbortSignal.timeout(10_000),
        })
        if (response.ok) {
          triggered = true
          break
        }
        console.warn(`Worker attempt ${attempt} returned ${response.status}`)
      } catch (fetchErr) {
        console.warn(`Worker attempt ${attempt} failed`, fetchErr)
      }
    }

    if (!triggered) {
      await supabaseAdmin
        .from('projects')
        .update({
          status: 'error',
          error_message: 'Could not reach the processing worker. Please try again.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
      return NextResponse.json({ error: 'Failed to reach worker' }, { status: 503 })
    }

    return NextResponse.json({ ok: true, projectId })
  } catch (err) {
    console.error('Unexpected error in POST /api/projects/[projectId]/start', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
