import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getPresignedReadUrl } from '@/lib/r2'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, user_id, video_r2_key')
      .eq('id', projectId)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (project.user_id !== userRow.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!project.video_r2_key) {
      return NextResponse.json({ error: 'No video available for this project' }, { status: 404 })
    }

    // 2-hour expiry — gives the user plenty of time to watch while editing
    const url = await getPresignedReadUrl(project.video_r2_key, 7200)

    return NextResponse.json({ url })
  } catch (err) {
    console.error('GET /api/projects/[projectId]/video-url', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
