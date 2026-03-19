import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendWarningEmail } from '@/lib/resend'

/**
 * POST /api/cron/warning-emails
 *
 * Sends retention warning emails at days 1, 7, 15, and 29 after subscription
 * cancellation. Projects are deleted on day 30.
 *
 * Uses Option B: stamps warning_*_sent_at columns only after successful send,
 * so a failed cron run will retry on the next execution.
 *
 * Protected by CRON_SECRET. Schedule: once per day.
 */

type WarningDay = 1 | 7 | 15 | 29

const WARNINGS: { days: WarningDay; column: string }[] = [
  { days: 1,  column: 'warning_1_sent_at'  },
  { days: 7,  column: 'warning_7_sent_at'  },
  { days: 15, column: 'warning_15_sent_at' },
  { days: 29, column: 'warning_29_sent_at' },
]

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const now = new Date()

  const { data: subs, error: subsError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id, subscription_ended_at, warning_1_sent_at, warning_7_sent_at, warning_15_sent_at, warning_29_sent_at')
    .eq('status', 'canceled')
    .not('subscription_ended_at', 'is', null)

  if (subsError) {
    console.error('[WarningEmails] Failed to query subscriptions', subsError)
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 })
  }

  if (!subs || subs.length === 0) {
    console.log('[WarningEmails] No canceled subscriptions to process')
    return NextResponse.json({ sent: 0 })
  }

  let totalSent = 0

  for (const sub of subs) {
    const endedAt = new Date(sub.subscription_ended_at as string)
    const deletionDate = new Date(endedAt)
    deletionDate.setDate(deletionDate.getDate() + 30)

    // Skip if already past deletion date — the retention cron handles cleanup
    if (now >= deletionDate) continue

    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', sub.user_id as string)
      .single()

    if (!userRow) continue

    const daysSinceEnd = (now.getTime() - endedAt.getTime()) / (1000 * 60 * 60 * 24)

    for (const warning of WARNINGS) {
      // Already sent
      const sentAt = (sub as Record<string, unknown>)[warning.column]
      if (sentAt !== null && sentAt !== undefined) continue

      // Not yet due
      if (daysSinceEnd < warning.days) continue

      const sent = await sendWarningEmail({
        to: userRow.email,
        deletionDate,
        warningDay: warning.days,
      })

      if (sent) {
        await supabaseAdmin
          .from('subscriptions')
          .update({ [warning.column]: now.toISOString() })
          .eq('user_id', sub.user_id as string)

        totalSent++
        console.log(`[WarningEmails] Sent day-${warning.days} warning to ${userRow.email}`)
      }
    }
  }

  console.log(`[WarningEmails] Done – sent ${totalSent} email(s)`)
  return NextResponse.json({ sent: totalSent })
}
