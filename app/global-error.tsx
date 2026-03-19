'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h2 className="text-2xl font-bold text-slate-700">Something went wrong</h2>
          <p className="text-slate-500">An unexpected error occurred. Please try again.</p>
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
