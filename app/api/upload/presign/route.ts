import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getPresignedUploadUrl, buildR2Key } from '@/lib/r2'
import { resolvePlanTier, getPlanLimits } from '@/lib/plan-limits'

const ALLOWED_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
])

function sanitiseFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function stripExtension(name: string): string {
  const lastDot = name.lastIndexOf('.')
  return lastDot > 0 ? name.slice(0, lastDot) : name
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const body: unknown = await req.json()
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as Record<string, unknown>).fileName !== 'string' ||
      typeof (body as Record<string, unknown>).fileSize !== 'number' ||
      typeof (body as Record<string, unknown>).contentType !== 'string'
    ) {
      return NextResponse.json(
        { error: 'fileName, fileSize, and contentType are required' },
        { status: 400 },
      )
    }

    const { fileName, fileSize, contentType } = body as {
      fileName: string
      fileSize: number
      contentType: string
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Allowed: MP4, MOV, AVI, MKV, WebM' },
        { status: 400 },
      )
    }

    // Look up Supabase user
    const { data: userRow, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, subscription_status, plan_name')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !userRow) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check active subscription
    const { data: subscriptionRow } = await supabaseAdmin
      .from('subscriptions')
      .select('status, plan_name, stripe_product_id')
      .eq('user_id', userRow.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const isLegacy = userRow.subscription_status === 'legacy'

    const hasActiveSubscription =
      isLegacy ||
      subscriptionRow?.status === 'active' ||
      subscriptionRow?.status === 'trialing' ||
      (!subscriptionRow && userRow.subscription_status === 'active')

    if (!hasActiveSubscription) {
      return NextResponse.json(
        { error: 'Active subscription required', redirectTo: '/pricing' },
        { status: 402 },
      )
    }

    // Legacy users always get Business-tier limits (max capacity)
    const tier = isLegacy
      ? 'business'
      : resolvePlanTier(
          subscriptionRow?.plan_name ?? userRow.plan_name,
          (subscriptionRow as { stripe_product_id?: string | null } | null)?.stripe_product_id ?? null,
        )
    const limits = getPlanLimits(tier)

    // Validate file size
    if (fileSize > limits.maxFileSizeBytes) {
      const limitGb = Math.round(limits.maxFileSizeBytes / (1024 * 1024 * 1024))
      return NextResponse.json(
        { error: `File exceeds your plan's ${limitGb} GB limit` },
        { status: 400 },
      )
    }

    // Check monthly project count (skip if unlimited)
    if (limits.maxMonthlyProjects !== Infinity) {
      const startOfMonth = new Date()
      startOfMonth.setUTCDate(1)
      startOfMonth.setUTCHours(0, 0, 0, 0)

      const { count, error: countError } = await supabaseAdmin
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userRow.id)
        .gte('created_at', startOfMonth.toISOString())

      if (countError) {
        console.error('Error counting projects', { userId, error: countError })
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      if ((count ?? 0) >= limits.maxMonthlyProjects) {
        return NextResponse.json(
          {
            error: `You've reached your plan's limit of ${limits.maxMonthlyProjects} projects per month`,
          },
          { status: 400 },
        )
      }
    }

    // Generate project ID and R2 key
    const projectId = crypto.randomUUID()
    const sanitised = sanitiseFilename(fileName)
    const r2Key = buildR2Key(userId, projectId, 'video', sanitised)

    // Create project record in Supabase
    const { error: insertError } = await supabaseAdmin.from('projects').insert({
      id: projectId,
      user_id: userRow.id,
      title: stripExtension(fileName),
      status: 'uploading',
      video_r2_key: r2Key,
      video_size_bytes: fileSize,
    })

    if (insertError) {
      console.error('Error creating project', { userId, projectId, error: insertError })
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
    }

    // Generate presigned upload URL
    let uploadUrl: string
    try {
      uploadUrl = await getPresignedUploadUrl(r2Key, contentType)
    } catch (r2Error) {
      // Clean up the project row if R2 presign fails
      await supabaseAdmin.from('projects').delete().eq('id', projectId)
      console.error('Error generating presigned URL', { userId, projectId, error: r2Error })
      return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
    }

    return NextResponse.json({ uploadUrl, projectId, r2Key })
  } catch (err) {
    console.error('Unexpected error in presign route', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
