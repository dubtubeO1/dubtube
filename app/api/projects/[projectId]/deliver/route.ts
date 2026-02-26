import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(
  _req: NextRequest,
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

    // Verify ownership
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (!userRow) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, user_id, status')
      .eq('id', projectId)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if ((project as { user_id: string }).user_id !== userRow.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const status = (project as { status: string }).status
    if (status !== 'completed' && status !== 'delivered') {
      return NextResponse.json(
        { error: 'Project must be in completed or delivered status to generate dubbed audio' },
        { status: 409 },
      )
    }

    // Mark as delivering
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      .update({ status: 'delivering', updated_at: new Date().toISOString() })
      .eq('id', projectId)

    if (updateError) {
      console.error('Failed to set delivering status', { userId, projectId, error: updateError })
      return NextResponse.json({ error: 'Failed to start delivery' }, { status: 500 })
    }

    // Trigger worker /deliver
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
        const response = await fetch(`${workerUrl}/deliver`, {
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
        console.warn(`Worker deliver attempt ${attempt} returned ${response.status}`)
      } catch (fetchErr) {
        console.warn(`Worker deliver attempt ${attempt} failed`, fetchErr)
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
    console.error('Unexpected error in POST /api/projects/[projectId]/deliver', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
