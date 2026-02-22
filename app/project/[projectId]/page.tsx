import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock } from 'lucide-react'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { projectId } = await params

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 relative overflow-hidden">
      {/* Floating background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-16">
        <Link
          href="/dashboard"
          className="inline-flex items-center space-x-2 text-slate-500 hover:text-slate-700 transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Dashboard</span>
        </Link>

        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-10 text-center space-y-6">
          <div className="flex justify-center">
            <div className="p-4 bg-slate-100 rounded-full">
              <Clock className="w-8 h-8 text-slate-500" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-700">Project Workspace</h1>
            <p className="text-sm font-mono text-slate-400">{projectId}</p>
          </div>

          <p className="text-slate-500 max-w-sm mx-auto">
            Your video has been uploaded. The full dubbing workspace — transcription, translation
            editing, and audio playback — is coming in the next milestone.
          </p>

          <div className="pt-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
