import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const { projectId } = await params

    // Parse and validate request body
    const body: unknown = await req.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const { segmentOrder } = body as { segmentOrder?: unknown }
    if (
      !Array.isArray(segmentOrder) ||
      segmentOrder.length === 0 ||
      segmentOrder.some((id) => typeof id !== 'string')
    ) {
      return NextResponse.json(
        { error: 'segmentOrder must be a non-empty array of segment IDs' },
        { status: 400 },
      )
    }
    const orderedIds = segmentOrder as string[]

    // Verify ownership
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, user_id, status')
      .eq('id', projectId)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    if ((project as { user_id: string }).user_id !== userRow.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const status = (project as { status: string }).status
    if (status !== 'delivered' && status !== 'completed') {
      return NextResponse.json(
        { error: 'Project must be delivered before remixing' },
        { status: 409 },
      )
    }

    // Verify all provided IDs belong to this project
    const { data: transcripts } = await supabaseAdmin
      .from('transcripts')
      .select('id')
      .eq('project_id', projectId)
      .in('id', orderedIds)

    if (!transcripts || transcripts.length !== orderedIds.length) {
      return NextResponse.json(
        { error: 'One or more segment IDs do not belong to this project' },
        { status: 400 },
      )
    }

    // Mark as delivering
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      .update({ status: 'delivering', updated_at: new Date().toISOString() })
      .eq('id', projectId)

    if (updateError) {
      console.error('Failed to set delivering status for remix', { userId, projectId, error: updateError })
      return NextResponse.json({ error: 'Failed to start remix' }, { status: 500 })
    }

    // Trigger worker /remix
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
        const response = await fetch(`${workerUrl}/remix`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${workerSecret}`,
          },
          body: JSON.stringify({ projectId, segmentOrder: orderedIds }),
          signal: AbortSignal.timeout(10_000),
        })
        if (response.ok) {
          triggered = true
          break
        }
        console.warn(`Worker remix attempt ${attempt} returned ${response.status}`)
      } catch (fetchErr) {
        console.warn(`Worker remix attempt ${attempt} failed`, fetchErr)
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
    console.error('Unexpected error in POST /api/projects/[projectId]/remix', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
