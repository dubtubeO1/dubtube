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
      .select('id, user_id, dubbed_audio_r2_key')
      .eq('id', projectId)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    if ((project as { user_id: string }).user_id !== userRow.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const r2Key = (project as { dubbed_audio_r2_key: string | null }).dubbed_audio_r2_key
    if (!r2Key) {
      return NextResponse.json({ error: 'Dubbed audio not yet available' }, { status: 404 })
    }

    // 1-hour presigned URL for download
    const url = await getPresignedReadUrl(r2Key, 3600)

    return NextResponse.json({ url })
  } catch (err) {
    console.error('GET /api/projects/[projectId]/dubbed-audio-url', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
