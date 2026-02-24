'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Circle, AlertCircle, Loader2 } from 'lucide-react'

type ProjectStatus =
  | 'uploading'
  | 'ready'
  | 'queued'
  | 'transcribing'
  | 'translating'
  | 'generating_audio'
  | 'completed'
  | 'error'

interface Project {
  id: string
  title: string
  status: ProjectStatus
  error_message: string | null
  source_language: string | null
  target_language: string | null
}

const PIPELINE_STAGES: { key: ProjectStatus; label: string; description: string }[] = [
  { key: 'queued', label: 'Queued', description: 'Waiting for the processing worker' },
  { key: 'transcribing', label: 'Transcribing', description: 'Extracting and transcribing audio' },
  { key: 'translating', label: 'Translating', description: 'Translating transcript segments' },
  { key: 'generating_audio', label: 'Generating voices', description: 'Creating dubbed audio clips' },
  { key: 'completed', label: 'Complete', description: 'Transcript and voiceovers are ready' },
]

const STATUS_ORDER: Record<string, number> = {
  uploading: 0,
  ready: 0,
  queued: 1,
  transcribing: 2,
  translating: 3,
  generating_audio: 4,
  completed: 5,
  error: 99,
}

function getStageState(
  stageKey: ProjectStatus,
  currentStatus: string,
): 'done' | 'current' | 'pending' {
  if (currentStatus === 'error') return 'pending'
  const stageOrder = STATUS_ORDER[stageKey] ?? 0
  const currentOrder = STATUS_ORDER[currentStatus] ?? 0
  if (currentOrder > stageOrder) return 'done'
  if (currentOrder === stageOrder) return 'current'
  return 'pending'
}

const POLL_INTERVAL_MS = 3000
const TERMINAL_STATUSES = new Set<string>(['completed', 'error'])

export default function ProjectPage() {
  const params = useParams()
  const projectId = params.projectId as string

  const [project, setProject] = useState<Project | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setLoadError(data.error ?? 'Failed to load project')
        return
      }
      const data = (await res.json()) as { project: Project }
      setProject(data.project)
    } catch {
      setLoadError('Network error — could not load project status')
    }
  }, [projectId])

  // Initial load
  useEffect(() => {
    void fetchProject()
  }, [fetchProject])

  // Polling — stops once a terminal status is reached
  useEffect(() => {
    if (!project) return
    if (TERMINAL_STATUSES.has(project.status)) return

    const timer = setInterval(() => {
      void fetchProject()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [project, fetchProject])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 relative overflow-hidden">
      {/* Floating background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-16">
        <Link
          href="/dashboard"
          className="inline-flex items-center space-x-2 text-slate-500 hover:text-slate-700 transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Dashboard</span>
        </Link>

        {/* Loading skeleton */}
        {!project && !loadError && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        )}

        {/* Load error */}
        {loadError && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-8 space-y-4 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
            <p className="text-slate-600">{loadError}</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </Link>
          </div>
        )}

        {/* Project card */}
        {project && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-8 space-y-8">
            {/* Header */}
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-slate-700 truncate">{project.title}</h1>
              {project.target_language && (
                <p className="text-sm text-slate-400">
                  {project.source_language
                    ? `${project.source_language} → ${project.target_language}`
                    : `→ ${project.target_language}`}
                </p>
              )}
            </div>

            {/* Error state */}
            {project.status === 'error' && (
              <div className="space-y-4">
                <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium mb-0.5">Processing failed</p>
                    <p className="text-red-600">
                      {project.error_message ?? 'An unexpected error occurred.'}
                    </p>
                  </div>
                </div>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Dashboard</span>
                </Link>
              </div>
            )}

            {/* Pipeline progress */}
            {project.status !== 'error' && (
              <div className="space-y-3">
                {PIPELINE_STAGES.map((stage) => {
                  const state = getStageState(stage.key, project.status)
                  return (
                    <div
                      key={stage.key}
                      className={`flex items-center space-x-4 p-4 rounded-xl border transition-colors ${
                        state === 'current'
                          ? 'bg-slate-50 border-slate-300'
                          : state === 'done'
                            ? 'bg-green-50/50 border-green-200'
                            : 'bg-white/50 border-slate-100'
                      }`}
                    >
                      <div className="shrink-0">
                        {state === 'done' && (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                        {state === 'current' && (
                          <Loader2 className="w-5 h-5 text-slate-600 animate-spin" />
                        )}
                        {state === 'pending' && (
                          <Circle className="w-5 h-5 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            state === 'done'
                              ? 'text-green-700'
                              : state === 'current'
                                ? 'text-slate-700'
                                : 'text-slate-400'
                          }`}
                        >
                          {stage.label}
                        </p>
                        {state === 'current' && (
                          <p className="text-xs text-slate-400 mt-0.5">{stage.description}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Completed state */}
            {project.status === 'completed' && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 space-y-1">
                <p className="font-medium">Transcript and voiceovers are ready</p>
                <p className="text-green-600">
                  The full editing workspace is coming in the next update.
                </p>
              </div>
            )}

            {/* Processing note */}
            {project.status !== 'completed' && project.status !== 'error' && (
              <p className="text-xs text-slate-400 text-center">
                Processing continues in the background — you can safely close this page.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
