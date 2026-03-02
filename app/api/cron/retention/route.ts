import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { deleteR2Prefix } from '@/lib/r2';

/**
 * POST /api/cron/retention
 *
 * Deletes all projects (and associated R2 files) for users whose
 * subscription ended more than 90 days ago.
 *
 * Protected by CRON_SECRET — only Railway's cron scheduler should call this.
 * Schedule: once per day.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffIso = cutoff.toISOString();

  console.log(`[Retention] Running – cutoff: ${cutoffIso}`);

  // Find subscriptions that ended >90 days ago and are still canceled
  const { data: expiredSubs, error: subsError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id, subscription_ended_at')
    .eq('status', 'canceled')
    .lt('subscription_ended_at', cutoffIso)
    .not('subscription_ended_at', 'is', null);

  if (subsError) {
    console.error('[Retention] Failed to query expired subscriptions', subsError);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  if (!expiredSubs || expiredSubs.length === 0) {
    console.log('[Retention] No expired subscriptions to process');
    return NextResponse.json({ deleted: 0 });
  }

  const userIds = expiredSubs.map((s) => s.user_id as string);
  console.log(`[Retention] Found ${userIds.length} user(s) with expired subscriptions`);

  let totalProjectsDeleted = 0;

  for (const userId of userIds) {
    // Fetch user's Clerk ID for R2 prefix
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id, clerk_user_id')
      .eq('id', userId)
      .single();

    if (!userRow) {
      console.warn(`[Retention] User not found for id=${userId}, skipping`);
      continue;
    }

    // Fetch all projects for this user
    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (!projects || projects.length === 0) {
      console.log(`[Retention] No projects for user ${userId}`);
      continue;
    }

    for (const project of projects) {
      const projectId = project.id as string;

      // Delete all R2 files under this project prefix
      const r2Prefix = `${userRow.clerk_user_id}/${projectId}/`;
      try {
        await deleteR2Prefix(r2Prefix);
      } catch (r2Err) {
        console.error(`[Retention] R2 deletion failed for project ${projectId}`, r2Err);
        // Continue — don't block DB cleanup on R2 failures
      }

      // Delete transcripts + speakers
      await supabaseAdmin.from('transcripts').delete().eq('project_id', projectId);
      await supabaseAdmin.from('speakers').delete().eq('project_id', projectId);

      // Delete project row
      await supabaseAdmin.from('projects').delete().eq('id', projectId);

      totalProjectsDeleted++;
      console.log(`[Retention] Deleted project ${projectId}`);
    }
  }

  console.log(`[Retention] Done – deleted ${totalProjectsDeleted} project(s)`);
  return NextResponse.json({ deleted: totalProjectsDeleted });
}
