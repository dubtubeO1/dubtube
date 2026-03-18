'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  CheckCircle,
  Loader2,
  Clock,
  Languages,
  XCircle,
  Download,
  FileVideo,
  Trash2,
  AlertTriangle,
  Pencil,
  RefreshCcw,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectStatus =
  | 'uploading'
  | 'ready'
  | 'queued'
  | 'transcribing'
  | 'translating'
  | 'generating_audio'
  | 'completed'
  | 'delivering'
  | 'delivered'
  | 'error'

interface Project {
  id: string
  title: string
  status: ProjectStatus
  source_language: string | null
  target_language: string | null
  video_size_bytes: number | null
  created_at: string
  error_message: string | null
}

interface UserData {
  subscription_status: string | null
  plan_name: string | null
  stripe_customer_id: string | null
  created_at: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ProjectStatus, string> = {
  uploading: 'Uploading',
  ready: 'Ready',
  queued: 'Queued',
  transcribing: 'Transcribing',
  translating: 'Translating',
  generating_audio: 'Generating voices',
  completed: 'Completed',
  delivering: 'Mixing audio',
  delivered: 'Delivered',
  error: 'Failed',
}

const STATUS_COLOR: Record<ProjectStatus, string> = {
  uploading: 'bg-slate-100 text-slate-600',
  ready: 'bg-slate-100 text-slate-600',
  queued: 'bg-amber-100 text-amber-700',
  transcribing: 'bg-blue-100 text-blue-700',
  translating: 'bg-blue-100 text-blue-700',
  generating_audio: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  delivering: 'bg-blue-100 text-blue-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
}

function isProcessing(status: ProjectStatus): boolean {
  return ['queued', 'transcribing', 'translating', 'generating_audio', 'delivering'].includes(status)
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter()
  const { user, isLoaded } = useUser()

  const [userData, setUserData] = useState<UserData | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [retryLoadingId, setRetryLoadingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded || !user) return

    const load = async () => {
      try {
        const [userRes, projectsRes] = await Promise.all([
          fetch('/api/me/subscription'),
          fetch('/api/projects'),
        ])

        if (userRes.ok) {
          const data = (await userRes.json()) as UserData
          setUserData(data)
        }

        if (projectsRes.ok) {
          const data = (await projectsRes.json()) as { projects: Project[] }
          setProjects(data.projects)
        }
      } catch {
        // Non-fatal
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [isLoaded, user])

  // Refresh on return from Stripe checkout
  useEffect(() => {
    if (!user) return
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('success') === 'true') {
      setTimeout(() => {
        void fetch('/api/me/subscription')
          .then((r) => r.json())
          .then((data: unknown) => setUserData(data as UserData))
          .catch(() => undefined)
      }, 2000)
    }
  }, [user])

  if (!isLoaded || loading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  // Usage stats
  const now = new Date()
  const thisMonthProjects = projects.filter((p) => {
    const created = new Date(p.created_at)
    return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth()
  }).length

  // Plan limits — mirrors lib/plan-limits.ts PLAN_LIMITS
  const MONTHLY_LIMITS: Record<string, number> = {
    starter: 3,
    pro: 10,
    business: Infinity,
  }
  const planName = userData?.plan_name ?? null
  const maxMonthlyProjects = planName && planName in MONTHLY_LIMITS ? MONTHLY_LIMITS[planName] : 10

  const planLabel = planName
    ? planName.charAt(0).toUpperCase() + planName.slice(1)
    : 'Free'

  const confirmDeleteProject = projects.find((p) => p.id === confirmDeleteId) ?? null

  const handleRetry = async (project: Project) => {
    if (!project.target_language) return
    setRetryLoadingId(project.id)
    setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, status: 'queued' } : p))
    try {
      const res = await fetch(`/api/projects/${project.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_language: project.source_language, target_language: project.target_language }),
      })
      if (!res.ok) {
        setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, status: 'error' } : p))
      }
    } catch {
      setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, status: 'error' } : p))
    } finally {
      setRetryLoadingId(null)
    }
  }

  const handleRenameProject = async (projectId: string, newTitle: string) => {
    const trimmed = newTitle.trim()
    setEditingProjectId(null)
    if (!trimmed) return
    const current = projects.find((p) => p.id === projectId)
    if (trimmed === current?.title) return
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      })
      if (res.ok) {
        setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, title: trimmed } : p))
      }
    } catch {
      // Silent — title stays as-is
    }
  }

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return
    setDeleteLoadingId(confirmDeleteId)
    setConfirmDeleteId(null)
    try {
      await fetch(`/api/projects/${confirmDeleteId}`, { method: 'DELETE' })
      setProjects((prev) => prev.filter((p) => p.id !== confirmDeleteId))
    } catch {
      // Silent — project will still appear until next refresh
    } finally {
      setDeleteLoadingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* ── Delete confirmation modal ── */}
      {confirmDeleteProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 max-w-sm w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Delete project?</p>
                <p className="text-sm text-slate-500 mt-1">
                  <span className="font-medium text-slate-700">{confirmDeleteProject.title}</span> will
                  be permanently deleted — including all files and transcript data. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDeleteConfirm()}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-white/50 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-700">Dashboard</h1>
              <p className="text-slate-600 mt-1">Welcome back, {user.firstName}!</p>
            </div>
            <button
              onClick={() => router.push('/dashboard/new')}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Plan */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500 mb-1">Current Plan</p>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-lg font-semibold text-slate-700">{planLabel}</span>
              <span className="text-xs text-slate-400 capitalize">
                {userData?.subscription_status ?? 'free'}
              </span>
            </div>
            {userData?.stripe_customer_id ? (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/stripe/portal', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userData }),
                    })
                    const result = (await res.json()) as { url?: string }
                    if (result.url) window.location.href = result.url
                    else alert('Failed to open billing portal. Please try again.')
                  } catch {
                    alert('Error opening billing portal. Please try again.')
                  }
                }}
                className="mt-4 text-xs text-slate-500 underline hover:text-slate-700 transition-colors"
              >
                Manage subscription
              </button>
            ) : (
              <Link
                href="/pricing"
                className="mt-4 inline-block text-xs text-slate-500 underline hover:text-slate-700 transition-colors"
              >
                Upgrade to a plan
              </Link>
            )}
          </div>

          {/* Projects this month */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500 mb-1">Projects this month</p>
            <p className="text-3xl font-bold text-slate-700">
              {thisMonthProjects}
              <span className="text-base font-normal text-slate-400 ml-1">
                {maxMonthlyProjects === Infinity ? '/ unlimited' : `/ ${maxMonthlyProjects}`}
              </span>
            </p>
            <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-600 transition-all"
                style={{
                  width: maxMonthlyProjects === Infinity
                    ? '0%'
                    : `${Math.min(100, (thisMonthProjects / maxMonthlyProjects) * 100)}%`,
                }}
              />
            </div>
          </div>

          {/* Total projects */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500 mb-1">Total projects</p>
            <p className="text-3xl font-bold text-slate-700">{projects.length}</p>
            <p className="text-xs text-slate-400 mt-1">all time</p>
          </div>
        </div>

        {/* Project list */}
        <div>
          <h2 className="text-xl font-semibold text-slate-700 mb-4">Projects</h2>

          {projects.length === 0 ? (
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <FileVideo className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-4">No projects yet. Upload a video to get started.</p>
              <button
                onClick={() => router.push('/dashboard/new')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Project
              </button>
            </div>
          ) : (
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="divide-y divide-slate-100">
                {projects.map((project) => {
                  const isEditing = editingProjectId === project.id
                  const rowClass = 'relative flex items-center gap-4 px-6 py-4 hover:bg-slate-50/80 transition-colors group'

                  const rowContent = (
                    <>
                      {/* Status icon */}
                      <div className="shrink-0">
                        {project.status === 'error' ? (
                          <XCircle className="w-5 h-5 text-red-400" />
                        ) : project.status === 'delivered' ? (
                          <Download className="w-5 h-5 text-emerald-500" />
                        ) : project.status === 'completed' ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : isProcessing(project.status) ? (
                          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                        ) : (
                          <Clock className="w-5 h-5 text-slate-300" />
                        )}
                      </div>

                      {/* Title + meta */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            autoFocus
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                            onBlur={() => void handleRenameProject(project.id, titleDraft)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleRenameProject(project.id, titleDraft)
                              if (e.key === 'Escape') setEditingProjectId(null)
                            }}
                            className="text-sm font-medium text-slate-700 bg-transparent border-b border-slate-400 focus:border-slate-700 focus:outline-none w-full"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 group/title">
                            <p className="text-sm font-medium text-slate-700 truncate group-hover:text-slate-900 transition-colors">
                              {project.title}
                            </p>
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setTitleDraft(project.title)
                                setEditingProjectId(project.id)
                              }}
                              title="Rename project"
                              className="shrink-0 p-0.5 rounded text-slate-300 hover:text-slate-600 transition-colors opacity-0 group-hover/title:opacity-100"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                          {project.source_language && project.target_language && (
                            <span className="flex items-center gap-1">
                              <Languages className="w-3 h-3" />
                              {project.source_language} → {project.target_language}
                            </span>
                          )}
                          {project.video_size_bytes && (
                            <span className="flex items-center gap-1">
                              <FileVideo className="w-3 h-3" />
                              {formatBytes(project.video_size_bytes)}
                            </span>
                          )}
                          <span>{formatDate(project.created_at)}</span>
                        </div>
                        {project.status === 'error' && project.error_message && (
                          <p className="text-xs text-red-500 mt-0.5 truncate">{project.error_message}</p>
                        )}
                      </div>

                      {/* Status badge */}
                      <div className="shrink-0">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[project.status]}`}
                        >
                          {isProcessing(project.status) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                          )}
                          {STATUS_LABEL[project.status]}
                        </span>
                      </div>

                      {/* Retry button — error only */}
                      {project.status === 'error' && (
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void handleRetry(project)
                          }}
                          title="Retry processing"
                          disabled={retryLoadingId === project.id}
                          className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {retryLoadingId === project.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (deleteLoadingId === project.id) return
                          setConfirmDeleteId(project.id)
                        }}
                        title="Delete project"
                        className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        {deleteLoadingId === project.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </>
                  )

                  return isEditing ? (
                    <div key={project.id} className={rowClass}>
                      {rowContent}
                    </div>
                  ) : (
                    <Link key={project.id} href={`/project/${project.id}`} className={rowClass}>
                      {rowContent}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
