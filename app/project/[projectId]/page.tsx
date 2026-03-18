'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  CheckCircle,
  Circle,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  RefreshCw,
  Save,
  Pencil,
  Download,
  Timer,
  ExternalLink,
  Info,
  X,
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
  error_message: string | null
  source_language: string | null
  target_language: string | null
}

interface TranscriptRow {
  id: string
  speaker_id: string | null
  speaker_name: string | null
  start_time: number | null
  end_time: number | null
  original_text: string | null
  translated_text: string | null
  segment_audio_r2_key: string | null
  voice_id: string | null
  duration_match: boolean
}

interface SpeakerRow {
  id: string
  speaker_id: string
  speaker_name: string | null
}

// ─── Pipeline constants ───────────────────────────────────────────────────────

const PIPELINE_STAGES: { key: ProjectStatus; label: string; description: string }[] = [
  { key: 'queued', label: 'Queued', description: 'Waiting for the processing worker' },
  { key: 'transcribing', label: 'Transcribing', description: 'Extracting and transcribing audio' },
  { key: 'translating', label: 'Translating', description: 'Translating transcript segments' },
  { key: 'generating_audio', label: 'Generating voices', description: 'Creating dubbed audio clips' },
  { key: 'completed', label: 'Complete', description: 'Transcript and voiceovers are ready' },
]

const DELIVER_STAGES: { key: ProjectStatus; label: string; description: string }[] = [
  { key: 'delivering', label: 'Mixing audio', description: 'Combining segment clips into dubbed audio track' },
  { key: 'delivered', label: 'Done', description: 'Dubbed audio is ready to download' },
]

const STATUS_ORDER: Record<string, number> = {
  uploading: 0,
  ready: 0,
  queued: 1,
  transcribing: 2,
  translating: 3,
  generating_audio: 4,
  completed: 5,
  delivering: 6,
  delivered: 7,
  error: 99,
}

const POLL_INTERVAL_MS = 3000
const AUTOSAVE_DEBOUNCE_MS = 3000
const AUTOSAVE_INTERVAL_MS = 30000
const TERMINAL_STATUSES = new Set<string>(['completed', 'delivered', 'error'])

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatTime(seconds: number | null): string {
  if (seconds === null) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string

  // ── Data state ──
  const [project, setProject] = useState<Project | null>(null)
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([])
  const [speakers, setSpeakers] = useState<SpeakerRow[]>([])
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── Editor state ──
  // Separate draft maps: draftOriginal for original_text, draftTranslated for translated_text
  const [draftOriginal, setDraftOriginal] = useState<Record<string, string>>({})
  const [draftTranslated, setDraftTranslated] = useState<Record<string, string>>({})
  const [speakerDrafts, setSpeakerDrafts] = useState<Record<string, string>>({})
  // editingTranscriptSpeakerId tracks which transcript row's speaker label is in edit mode.
  // Using transcript.id (not speaker.id) ensures only one label is in edit mode at a time,
  // even when multiple segments share the same speaker.
  const [editingTranscriptSpeakerId, setEditingTranscriptSpeakerId] = useState<string | null>(null)
  const [savingNameIds, setSavingNameIds] = useState<Set<string>>(new Set())
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set())
  const [retranslating, setRetranslating] = useState<Set<string>>(new Set())
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [delivering, setDelivering] = useState(false)
  const [showDurationBanner, setShowDurationBanner] = useState(true)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  // ── Refs ──
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioUrlsFetchedRef = useRef(false)
  // Always-current refs so saveAll and the 30s interval never see stale drafts
  const draftOriginalRef = useRef(draftOriginal)
  const draftTranslatedRef = useRef(draftTranslated)
  draftOriginalRef.current = draftOriginal
  draftTranslatedRef.current = draftTranslated

  // ── Fetching ──────────────────────────────────────────────────────────────

  const fetchVideoUrl = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/video-url`)
      if (!res.ok) return
      const data = (await res.json()) as { url: string }
      setVideoUrl(data.url)
    } catch {
      // Non-fatal — video player will simply not appear
    }
  }, [projectId])

  const fetchAudioUrls = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/audio-urls`)
      if (!res.ok) return
      const data = (await res.json()) as { urls: Record<string, string> }
      setAudioUrls(data.urls)
    } catch {
      // Non-fatal — audio buttons will be disabled
    }
  }, [projectId])

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setLoadError(data.error ?? 'Failed to load project')
        return
      }
      const data = (await res.json()) as {
        project: Project
        transcripts: TranscriptRow[]
        speakers: SpeakerRow[]
      }
      setProject(data.project)
      if (data.project.status === 'completed' || data.project.status === 'delivering' || data.project.status === 'delivered') {
        setTranscripts(data.transcripts)
        setSpeakers(data.speakers)
        if (!audioUrlsFetchedRef.current) {
          audioUrlsFetchedRef.current = true
          void fetchAudioUrls()
          void fetchVideoUrl()
        }
      }
    } catch {
      setLoadError('Network error — could not load project')
    }
  }, [projectId, fetchAudioUrls, fetchVideoUrl])

  useEffect(() => { void fetchProject() }, [fetchProject])

  useEffect(() => {
    if (!project) return
    if (TERMINAL_STATUSES.has(project.status)) return
    const timer = setInterval(() => { void fetchProject() }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [project, fetchProject])

  // ── Autosave ──────────────────────────────────────────────────────────────

  // saveAll reads from refs to always see the latest drafts regardless of when it fires
  const saveAll = useCallback(async () => {
    const toSave: Record<string, { original_text?: string; translated_text?: string }> = {}
    for (const [id, text] of Object.entries(draftOriginalRef.current)) {
      toSave[id] = { original_text: text }
    }
    for (const [id, text] of Object.entries(draftTranslatedRef.current)) {
      toSave[id] = { ...(toSave[id] ?? {}), translated_text: text }
    }

    if (Object.keys(toSave).length === 0) return
    setSaveStatus('saving')
    try {
      await Promise.all(
        Object.entries(toSave).map(([transcriptId, fields]) =>
          fetch(`/api/projects/${projectId}/transcripts/${transcriptId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields),
          }),
        ),
      )
      // Update transcripts state with saved values so textareas don't revert after drafts are cleared
      setTranscripts((prev) =>
        prev.map((t) => {
          const saved = toSave[t.id]
          if (!saved) return t
          return {
            ...t,
            ...(saved.original_text !== undefined ? { original_text: saved.original_text } : {}),
            ...(saved.translated_text !== undefined ? { translated_text: saved.translated_text } : {}),
          }
        }),
      )
      // Clear only the keys that were saved — new edits made during the save are preserved
      setDraftOriginal((prev) => {
        const next = { ...prev }
        for (const id of Object.keys(toSave)) {
          if (toSave[id].original_text !== undefined) delete next[id]
        }
        return next
      })
      setDraftTranslated((prev) => {
        const next = { ...prev }
        for (const id of Object.keys(toSave)) {
          if (toSave[id].translated_text !== undefined) delete next[id]
        }
        return next
      })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2500)
    } catch {
      setSaveStatus('error')
    }
  }, [projectId])

  const triggerDebounce = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void saveAll() }, AUTOSAVE_DEBOUNCE_MS)
  }, [saveAll])

  const onOriginalChange = useCallback(
    (transcriptId: string, value: string) => {
      setDraftOriginal((prev) => ({ ...prev, [transcriptId]: value }))
      triggerDebounce()
    },
    [triggerDebounce],
  )

  const onTranslatedChange = useCallback(
    (transcriptId: string, value: string) => {
      setDraftTranslated((prev) => ({ ...prev, [transcriptId]: value }))
      triggerDebounce()
    },
    [triggerDebounce],
  )

  useEffect(() => {
    const editorStatuses = new Set(['completed', 'delivering', 'delivered'])
    if (!project?.status || !editorStatuses.has(project.status)) return
    autosaveIntervalRef.current = setInterval(() => {
      const hasAny =
        Object.keys(draftOriginalRef.current).length > 0 ||
        Object.keys(draftTranslatedRef.current).length > 0
      if (hasAny) void saveAll()
    }, AUTOSAVE_INTERVAL_MS)
    return () => { if (autosaveIntervalRef.current) clearInterval(autosaveIntervalRef.current) }
  }, [project?.status, saveAll])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  // ── Playback ──────────────────────────────────────────────────────────────

  const handlePlay = useCallback(
    (transcriptId: string) => {
      const url = audioUrls[transcriptId]
      if (!url) return
      if (playingId === transcriptId) {
        audioRef.current?.pause()
        audioRef.current = null
        setPlayingId(null)
        return
      }
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      const audio = new Audio(url)
      audioRef.current = audio
      setPlayingId(transcriptId)
      audio.onended = () => { setPlayingId(null); audioRef.current = null }
      audio.onerror = () => { setPlayingId(null); audioRef.current = null }
      void audio.play()
    },
    [audioUrls, playingId],
  )

  // ── Regenerate (re-TTS from current translated text) ──────────────────────

  const handleRegenerate = useCallback(
    async (transcriptId: string) => {
      const pendingText = draftTranslatedRef.current[transcriptId]
      if (pendingText !== undefined) {
        try {
          const res = await fetch(
            `/api/projects/${projectId}/transcripts/${transcriptId}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ translated_text: pendingText }),
            },
          )
          if (res.ok) {
            setDraftTranslated((prev) => { const n = { ...prev }; delete n[transcriptId]; return n })
          }
        } catch { /* continue */ }
      }
      if (playingId === transcriptId) {
        audioRef.current?.pause(); audioRef.current = null; setPlayingId(null)
      }
      setRegenerating((prev) => new Set(prev).add(transcriptId))
      try {
        const res = await fetch(
          `/api/projects/${projectId}/transcripts/${transcriptId}/regenerate`,
          { method: 'POST' },
        )
        if (!res.ok) return
        const data = (await res.json()) as { url: string }
        setAudioUrls((prev) => ({ ...prev, [transcriptId]: data.url }))
      } catch { /* silent fail */ } finally {
        setRegenerating((prev) => { const n = new Set(prev); n.delete(transcriptId); return n })
      }
    },
    [projectId, playingId],
  )

  // ── Retranslate (re-DeepL from current original text) ────────────────────

  const handleRetranslate = useCallback(
    async (transcriptId: string) => {
      const pendingOriginal = draftOriginalRef.current[transcriptId]
      if (pendingOriginal !== undefined) {
        try {
          const res = await fetch(
            `/api/projects/${projectId}/transcripts/${transcriptId}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ original_text: pendingOriginal }),
            },
          )
          if (res.ok) {
            setDraftOriginal((prev) => { const n = { ...prev }; delete n[transcriptId]; return n })
          }
        } catch { /* continue */ }
      }
      setRetranslating((prev) => new Set(prev).add(transcriptId))
      try {
        const res = await fetch(
          `/api/projects/${projectId}/transcripts/${transcriptId}/retranslate`,
          { method: 'POST' },
        )
        if (!res.ok) return
        const data = (await res.json()) as { translated_text: string }
        // Update the transcript and clear any stale translated draft
        setTranscripts((prev) =>
          prev.map((t) =>
            t.id === transcriptId ? { ...t, translated_text: data.translated_text } : t,
          ),
        )
        setDraftTranslated((prev) => { const n = { ...prev }; delete n[transcriptId]; return n })
      } catch { /* silent fail */ } finally {
        setRetranslating((prev) => { const n = new Set(prev); n.delete(transcriptId); return n })
      }
    },
    [projectId],
  )

  // ── Deliver (generate dubbed audio) ──────────────────────────────────────

  const handleDeliver = useCallback(async () => {
    setDelivering(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/deliver`, { method: 'POST' })
      if (res.ok) {
        router.push(`/project/${projectId}/review`)
      } else {
        console.error('Failed to start delivery')
        setDelivering(false)
      }
    } catch {
      console.error('Deliver request failed')
      setDelivering(false)
    }
  }, [projectId, router])

  // ── Title editing ─────────────────────────────────────────────────────────

  const handleTitleSave = useCallback(async () => {
    const trimmed = titleDraft.trim()
    setIsEditingTitle(false)
    if (!trimmed || trimmed === project?.title) return
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      })
      if (res.ok) {
        setProject((prev) => (prev ? { ...prev, title: trimmed } : prev))
      }
    } catch {
      // Silent — title reverts to original on next load
    }
  }, [projectId, project?.title, titleDraft])

  // ── Duration match toggle ─────────────────────────────────────────────────

  const handleDurationMatchToggle = useCallback(
    async (transcriptId: string, currentValue: boolean) => {
      const newValue = !currentValue
      // Optimistic update
      setTranscripts((prev) =>
        prev.map((t) => (t.id === transcriptId ? { ...t, duration_match: newValue } : t)),
      )
      try {
        await fetch(`/api/projects/${projectId}/transcripts/${transcriptId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration_match: newValue }),
        })
      } catch {
        // Revert on failure
        setTranscripts((prev) =>
          prev.map((t) => (t.id === transcriptId ? { ...t, duration_match: currentValue } : t)),
        )
      }
    },
    [projectId],
  )

  const handleBulkDurationMatch = useCallback(
    async (enable: boolean) => {
      // Optimistic update all transcripts
      setTranscripts((prev) => prev.map((t) => ({ ...t, duration_match: enable })))
      try {
        await Promise.all(
          transcripts.map((t) =>
            fetch(`/api/projects/${projectId}/transcripts/${t.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ duration_match: enable }),
            }),
          ),
        )
      } catch {
        console.error('Bulk duration_match update failed')
      }
    },
    [projectId, transcripts],
  )

  // ── Speaker name editing ──────────────────────────────────────────────────

  const handleSpeakerSave = useCallback(
    async (transcriptId: string, speaker: SpeakerRow) => {
      const draft = speakerDrafts[speaker.id]
      if (draft === undefined || draft.trim() === (speaker.speaker_name ?? '')) {
        setEditingTranscriptSpeakerId(null)
        return
      }
      const trimmed = draft.trim()
      if (!trimmed) { setEditingTranscriptSpeakerId(null); return }

      setEditingTranscriptSpeakerId(null)
      setSavingNameIds((prev) => new Set(prev).add(speaker.id))
      try {
        const res = await fetch(`/api/projects/${projectId}/speakers/${speaker.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ speaker_name: trimmed }),
        })
        if (res.ok) {
          setSpeakers((prev) =>
            prev.map((s) => (s.id === speaker.id ? { ...s, speaker_name: trimmed } : s)),
          )
          // Cascade: update all transcript rows that share this speaker_id
          setTranscripts((prev) =>
            prev.map((t) =>
              t.speaker_id === speaker.speaker_id ? { ...t, speaker_name: trimmed } : t,
            ),
          )
          setSpeakerDrafts((prev) => { const n = { ...prev }; delete n[speaker.id]; return n })
        }
      } catch { /* revert is implicit */ } finally {
        setSavingNameIds((prev) => { const n = new Set(prev); n.delete(speaker.id); return n })
      }
    },
    [speakerDrafts, projectId],
  )

  const hasPendingEdits =
    Object.keys(draftOriginal).length > 0 || Object.keys(draftTranslated).length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
      </div>

      <div
        className={`relative z-10 px-4 py-10 mx-auto ${
          (project?.status === 'completed' || project?.status === 'delivering' || project?.status === 'delivered') ? 'max-w-6xl' : 'max-w-2xl'
        }`}
      >
        <Link
          href="/dashboard"
          className="inline-flex items-center space-x-2 text-slate-500 hover:text-slate-700 transition-colors mb-8"
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

        {/* ── Pipeline view (processing in progress) ── */}
        {project && project.status !== 'completed' && project.status !== 'delivering' && project.status !== 'delivered' && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-8 space-y-8">
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

            {project.status === 'error' && (
              <div className="space-y-4">
                <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
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

            {project.status !== 'error' && (
              <>
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
                          {state === 'done' && <CheckCircle className="w-5 h-5 text-green-500" />}
                          {state === 'current' && (
                            <Loader2 className="w-5 h-5 text-slate-600 animate-spin" />
                          )}
                          {state === 'pending' && <Circle className="w-5 h-5 text-slate-300" />}
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
                <p className="text-xs text-slate-400 text-center">
                  Processing continues in the background — you can safely close this page.
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Editor view (completed / delivering / delivered) ── */}
        {project && (project.status === 'completed' || project.status === 'delivering' || project.status === 'delivered') && (
          <div className="space-y-5">
            {/* Header card */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg px-6 py-4 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                {isEditingTitle ? (
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => void handleTitleSave()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleTitleSave()
                      if (e.key === 'Escape') setIsEditingTitle(false)
                    }}
                    className="text-lg font-bold text-slate-700 bg-transparent border-b border-slate-400 focus:border-slate-700 focus:outline-none w-full"
                  />
                ) : (
                  <div className="flex items-center gap-2 group/title">
                    <h1 className="text-lg font-bold text-slate-700 truncate">{project.title}</h1>
                    <button
                      onClick={() => { setTitleDraft(project.title); setIsEditingTitle(true) }}
                      className="opacity-0 group-hover/title:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-slate-600"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {project.target_language && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {project.source_language
                      ? `${project.source_language} → ${project.target_language}`
                      : `→ ${project.target_language}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {saveStatus === 'saving' && (
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving…
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="text-xs text-green-600 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Saved
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-xs text-red-500">Save failed — try again</span>
                )}
                <button
                  onClick={() => void saveAll()}
                  disabled={!hasPendingEdits || saveStatus === 'saving'}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save
                </button>
                {project.status === 'delivered' ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handleDeliver()}
                      disabled={delivering}
                      title="Re-mix the dubbed audio with current settings"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {delivering ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      Regenerate
                    </button>
                    <Link
                      href={`/project/${projectId}/review`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Dubbed Audio
                    </Link>
                  </div>
                ) : project.status === 'delivering' ? (
                  <Link
                    href={`/project/${projectId}/review`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors border border-slate-200"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Mixing audio…
                  </Link>
                ) : (
                  <button
                    onClick={() => void handleDeliver()}
                    disabled={delivering}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {delivering ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    Generate Dubbed Audio
                  </button>
                )}
              </div>
            </div>

            {/* Video player */}
            {videoUrl && (
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                <video
                  src={videoUrl}
                  controls
                  preload="metadata"
                  playsInline
                  className="w-full max-h-80 bg-black"
                />
              </div>
            )}

            {/* Duration match info banner */}
            {showDurationBanner && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 shrink-0 text-slate-400" />
                  <span>Match Duration is enabled by default — segments will be sped up or slowed down to fit the original timing.</span>
                </div>
                <button
                  onClick={() => setShowDurationBanner(false)}
                  className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Transcript editor */}
            {transcripts.length === 0 ? (
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-8 text-center text-slate-400 text-sm">
                No transcript segments found.
              </div>
            ) : (
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                {/* Column headers */}
                <div className="flex items-center justify-between px-6 py-3 bg-slate-50/80 border-b border-slate-200">
                  <div className="grid grid-cols-2 gap-6 flex-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Original{project.source_language ? ` (${project.source_language})` : ''}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Translation{project.target_language ? ` (${project.target_language})` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <button
                      onClick={() => void handleBulkDurationMatch(!transcripts.every((t) => t.duration_match))}
                      title="Toggle match original duration for all segments"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <Timer className="w-3.5 h-3.5" />
                      {transcripts.every((t) => t.duration_match) ? 'Unset all durations' : 'Match all durations'}
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {transcripts.map((transcript) => {
                    const speaker = speakers.find(
                      (s) => s.speaker_id === transcript.speaker_id,
                    )
                    const origDisplay =
                      draftOriginal[transcript.id] ?? transcript.original_text ?? ''
                    const translDisplay =
                      draftTranslated[transcript.id] ?? transcript.translated_text ?? ''
                    const isOrigDirty = transcript.id in draftOriginal
                    const isTranslDirty = transcript.id in draftTranslated
                    const isRegenerating = regenerating.has(transcript.id)
                    const isRetranslating = retranslating.has(transcript.id)
                    const isPlaying = playingId === transcript.id
                    const hasAudio = !!audioUrls[transcript.id]
                    const isEditingSpeaker = editingTranscriptSpeakerId === transcript.id

                    return (
                      <div key={transcript.id} className="px-6 py-4 space-y-3">
                        {/* Speaker label — shown above every segment, editable inline */}
                        <div className="flex items-center gap-2">
                          {isEditingSpeaker && speaker ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                autoFocus
                                value={
                                  speakerDrafts[speaker.id] ?? speaker.speaker_name ?? ''
                                }
                                onChange={(e) =>
                                  setSpeakerDrafts((prev) => ({
                                    ...prev,
                                    [speaker.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter')
                                    void handleSpeakerSave(transcript.id, speaker)
                                  if (e.key === 'Escape') {
                                    setEditingTranscriptSpeakerId(null)
                                    setSpeakerDrafts((prev) => {
                                      const n = { ...prev }
                                      delete n[speaker.id]
                                      return n
                                    })
                                  }
                                }}
                                onBlur={() => void handleSpeakerSave(transcript.id, speaker)}
                                className="text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-slate-400"
                              />
                              {savingNameIds.has(speaker.id) && (
                                <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                if (!speaker) return
                                setEditingTranscriptSpeakerId(transcript.id)
                                setSpeakerDrafts((prev) => ({
                                  ...prev,
                                  [speaker.id]: speaker.speaker_name ?? '',
                                }))
                              }}
                              className="flex items-center gap-1.5 group"
                            >
                              <span className="text-xs font-medium text-slate-500 px-2.5 py-1 bg-slate-100 rounded-md group-hover:bg-slate-200 transition-colors">
                                {speaker?.speaker_name ??
                                  transcript.speaker_name ??
                                  'Unknown Speaker'}
                              </span>
                              <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </div>

                        {/* Two-column segment content */}
                        <div className="grid grid-cols-2 gap-6">
                          {/* Left: original text — editable */}
                          <div className="space-y-2">
                            <p className="text-xs text-slate-400 font-mono tabular-nums">
                              {formatTime(transcript.start_time)} –{' '}
                              {formatTime(transcript.end_time)}
                            </p>
                            <textarea
                              value={origDisplay}
                              onChange={(e) =>
                                onOriginalChange(transcript.id, e.target.value)
                              }
                              rows={Math.max(2, Math.ceil((origDisplay.length || 1) / 55))}
                              className={`w-full text-sm text-slate-600 leading-relaxed bg-white border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none transition-colors ${
                                isOrigDirty
                                  ? 'border-amber-300 bg-amber-50/50'
                                  : 'border-slate-200'
                              }`}
                            />
                            <button
                              onClick={() => void handleRetranslate(transcript.id)}
                              disabled={isRetranslating}
                              title="Re-translate this segment with DeepL"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isRetranslating ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                              {isRetranslating ? 'Translating…' : 'Re-translate'}
                            </button>
                          </div>

                          {/* Right: translated text — editable */}
                          <div className="space-y-2">
                            {/* Spacer to align with timestamp on left */}
                            <p className="text-xs text-slate-400 select-none">&nbsp;</p>
                            <textarea
                              value={translDisplay}
                              onChange={(e) =>
                                onTranslatedChange(transcript.id, e.target.value)
                              }
                              rows={Math.max(2, Math.ceil((translDisplay.length || 1) / 55))}
                              className={`w-full text-sm text-slate-700 leading-relaxed bg-white border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none transition-colors ${
                                isTranslDirty
                                  ? 'border-amber-300 bg-amber-50/50'
                                  : 'border-slate-200'
                              }`}
                            />
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => handlePlay(transcript.id)}
                                disabled={!hasAudio}
                                title={
                                  !hasAudio
                                    ? 'No audio available'
                                    : isPlaying
                                      ? 'Pause'
                                      : 'Play'
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {isPlaying ? (
                                  <Pause className="w-3.5 h-3.5" />
                                ) : (
                                  <Play className="w-3.5 h-3.5" />
                                )}
                                {isPlaying ? 'Pause' : 'Play'}
                              </button>
                              <button
                                onClick={() => void handleRegenerate(transcript.id)}
                                disabled={isRegenerating}
                                title="Re-generate audio from current translation"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isRegenerating ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3.5 h-3.5" />
                                )}
                                {isRegenerating ? 'Generating…' : 'Regenerate'}
                              </button>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => void handleDurationMatchToggle(transcript.id, transcript.duration_match)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                    transcript.duration_match
                                      ? 'bg-slate-700 text-white hover:bg-slate-800'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  <Timer className="w-3.5 h-3.5" />
                                  Match duration
                                </button>
                                <div className="relative group">
                                  <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-default transition-colors" />
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2 rounded-lg bg-slate-800 text-white text-xs leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-10">
                                    When enabled, the dubbed audio for this segment will be sped up or slowed down to match the original speaker&apos;s timing. Disable it if the speed distortion is too noticeable.
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
