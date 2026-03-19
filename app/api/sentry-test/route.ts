import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

export async function GET(): Promise<NextResponse> {
  try {
    throw new Error('Sentry server-side test — safe to ignore')
  } catch (err) {
    Sentry.captureException(err)
    return NextResponse.json({ ok: true, message: 'Test error sent to Sentry' })
  }
}
