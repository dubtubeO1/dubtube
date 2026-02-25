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
      .select('id, user_id')
      .eq('id', projectId)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (project.user_id !== userRow.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Fetch all transcripts that have a segment audio key
    const { data: transcripts } = await supabaseAdmin
      .from('transcripts')
      .select('id, segment_audio_r2_key')
      .eq('project_id', projectId)
      .not('segment_audio_r2_key', 'is', null)

    if (!transcripts || transcripts.length === 0) {
      return NextResponse.json({ urls: {} })
    }

    // Generate presigned GET URLs in parallel (1-hour expiry)
    const entries = await Promise.all(
      transcripts.map(async (t) => {
        const url = await getPresignedReadUrl(t.segment_audio_r2_key!, 3600)
        return [t.id, url] as [string, string]
      }),
    )

    return NextResponse.json({ urls: Object.fromEntries(entries) })
  } catch (err) {
    console.error('GET /api/projects/[projectId]/audio-urls', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
