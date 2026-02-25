'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
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
  Save,
  Pencil,
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

const POLL_INTERVAL_MS = 3000
const AUTOSAVE_DEBOUNCE_MS = 3000
const AUTOSAVE_INTERVAL_MS = 30000
const TERMINAL_STATUSES = new Set<string>(['completed', 'error'])

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
  const projectId = params.projectId as string

  // ── Data state ──
  const [project, setProject] = useState<Project | null>(null)
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([])
  const [speakers, setSpeakers] = useState<SpeakerRow[]>([])
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── Editor state ──
  // draftTexts: pending unsaved translated_text changes, keyed by transcriptId
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({})
  const [speakerDrafts, setSpeakerDrafts] = useState<Record<string, string>>({})
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null)
  const [savingNameIds, setSavingNameIds] = useState<Set<string>>(new Set())
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set())
  const [playingId, setPlayingId] = useState<string | null>(null)

  // ── Refs ──
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioUrlsFetchedRef = useRef(false)
  // Always-current ref for draftTexts — avoids stale closure in saveAll/interval
  const draftTextsRef = useRef(draftTexts)
  draftTextsRef.current = draftTexts

  // ── Fetching ──────────────────────────────────────────────────────────────

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
      if (data.project.status === 'completed') {
        setTranscripts(data.transcripts)
        setSpeakers(data.speakers)
        if (!audioUrlsFetchedRef.current) {
          audioUrlsFetchedRef.current = true
          void fetchAudioUrls()
        }
      }
    } catch {
      setLoadError('Network error — could not load project')
    }
  }, [projectId, fetchAudioUrls])

  // Initial load
  useEffect(() => {
    void fetchProject()
  }, [fetchProject])

  // Polling — stops once a terminal status is reached
  useEffect(() => {
    if (!project) return
    if (TERMINAL_STATUSES.has(project.status)) return
    const timer = setInterval(() => { void fetchProject() }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [project, fetchProject])

  // ── Autosave ──────────────────────────────────────────────────────────────

  // saveAll reads from the ref so it never sees a stale draftTexts value
  const saveAll = useCallback(async () => {
    const toSave = { ...draftTextsRef.current }
    if (Object.keys(toSave).length === 0) return
    setSaveStatus('saving')
    try {
      await Promise.all(
        Object.entries(toSave).map(([transcriptId, translated_text]) =>
          fetch(`/api/projects/${projectId}/transcripts/${transcriptId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ translated_text }),
          }),
        ),
      )
      // Only clear keys that were saved — new edits made during the save are preserved
      setDraftTexts((prev) => {
        const next = { ...prev }
        for (const id of Object.keys(toSave)) delete next[id]
        return next
      })
      setSaveStatus('saved')
      setTimeout(
        () => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)),
        2500,
      )
    } catch {
      setSaveStatus('error')
    }
  }, [projectId])

  const onTextChange = useCallback(
    (transcriptId: string, value: string) => {
      setDraftTexts((prev) => ({ ...prev, [transcriptId]: value }))
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => { void saveAll() }, AUTOSAVE_DEBOUNCE_MS)
    },
    [saveAll],
  )

  // 30-second interval autosave
  useEffect(() => {
    if (project?.status !== 'completed') return
    autosaveIntervalRef.current = setInterval(() => {
      if (Object.keys(draftTextsRef.current).length > 0) void saveAll()
    }, AUTOSAVE_INTERVAL_MS)
    return () => {
      if (autosaveIntervalRef.current) clearInterval(autosaveIntervalRef.current)
    }
  }, [project?.status, saveAll])

  // Cleanup debounce on unmount
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    [],
  )

  // ── Playback ──────────────────────────────────────────────────────────────

  const handlePlay = useCallback(
    (transcriptId: string) => {
      const url = audioUrls[transcriptId]
      if (!url) return

      // Toggle off if already playing this segment
      if (playingId === transcriptId) {
        audioRef.current?.pause()
        audioRef.current = null
        setPlayingId(null)
        return
      }

      // Stop any other playing audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      const audio = new Audio(url)
      audioRef.current = audio
      setPlayingId(transcriptId)
      audio.onended = () => {
        setPlayingId(null)
        audioRef.current = null
      }
      audio.onerror = () => {
        setPlayingId(null)
        audioRef.current = null
      }
      void audio.play()
    },
    [audioUrls, playingId],
  )

  // ── Regenerate ────────────────────────────────────────────────────────────

  const handleRegenerate = useCallback(
    async (transcriptId: string) => {
      // Save any pending text for this segment before regenerating so the API uses the latest text
      const pendingText = draftTextsRef.current[transcriptId]
      if (pendingText !== undefined) {
        try {
          const saveRes = await fetch(
            `/api/projects/${projectId}/transcripts/${transcriptId}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ translated_text: pendingText }),
            },
          )
          if (saveRes.ok) {
            setDraftTexts((prev) => {
              const next = { ...prev }
              delete next[transcriptId]
              return next
            })
          }
        } catch {
          // Continue — regenerate will use the value already in the DB
        }
      }

      // Stop audio if this segment is currently playing
      if (playingId === transcriptId) {
        audioRef.current?.pause()
        audioRef.current = null
        setPlayingId(null)
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
      } catch {
        // Silent fail — user can try again
      } finally {
        setRegenerating((prev) => {
          const next = new Set(prev)
          next.delete(transcriptId)
          return next
        })
      }
    },
    [projectId, playingId],
  )

  // ── Speaker name editing ──────────────────────────────────────────────────

  const handleSpeakerSave = useCallback(
    async (speaker: SpeakerRow) => {
      const draft = speakerDrafts[speaker.id]
      if (draft === undefined || draft.trim() === (speaker.speaker_name ?? '')) {
        setEditingSpeakerId(null)
        return
      }
      const trimmed = draft.trim()
      if (!trimmed) {
        setEditingSpeakerId(null)
        return
      }

      setEditingSpeakerId(null)
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
          setTranscripts((prev) =>
            prev.map((t) =>
              t.speaker_id === speaker.speaker_id ? { ...t, speaker_name: trimmed } : t,
            ),
          )
          setSpeakerDrafts((prev) => {
            const next = { ...prev }
            delete next[speaker.id]
            return next
          })
        }
      } catch {
        // Revert is implicit — speaker state was not updated on failure
      } finally {
        setSavingNameIds((prev) => {
          const next = new Set(prev)
          next.delete(speaker.id)
          return next
        })
      }
    },
    [speakerDrafts, projectId],
  )

  const hasPendingEdits = Object.keys(draftTexts).length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
      </div>

      <div
        className={`relative z-10 px-4 py-10 mx-auto ${
          project?.status === 'completed' ? 'max-w-6xl' : 'max-w-2xl'
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
        {project && project.status !== 'completed' && (
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
                            <p className="text-xs text-slate-400 mt-0.5">
                              {stage.description}
                            </p>
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

        {/* ── Editor view (completed) ── */}
        {project && project.status === 'completed' && (
          <div className="space-y-5">
            {/* Header card */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg px-6 py-4 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-700 truncate">{project.title}</h1>
                {project.target_language && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {project.source_language
                      ? `${project.source_language} → ${project.target_language}`
                      : `→ ${project.target_language}`}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {/* Autosave status */}
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

                {/* Manual save */}
                <button
                  onClick={() => void saveAll()}
                  disabled={!hasPendingEdits || saveStatus === 'saving'}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save
                </button>

                {/* Generate — disabled in M4 */}
                <button
                  disabled
                  title="Coming in the next update"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 text-slate-400 text-sm font-medium cursor-not-allowed border border-slate-200"
                >
                  Generate Dubbed Video
                </button>
              </div>
            </div>

            {/* Transcript card */}
            {transcripts.length === 0 ? (
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-8 text-center text-slate-400 text-sm">
                No transcript segments found.
              </div>
            ) : (
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                {/* Column headers */}
                <div className="grid grid-cols-2 gap-6 px-6 py-3 bg-slate-50/80 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Original
                    {project.source_language ? ` (${project.source_language})` : ''}
                  </p>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Translation
                    {project.target_language ? ` (${project.target_language})` : ''}
                  </p>
                </div>

                {/* Segment rows */}
                <div className="divide-y divide-slate-100">
                  {transcripts.map((transcript, index) => {
                    const prevSpeakerId =
                      index > 0 ? transcripts[index - 1].speaker_id : null
                    const showSpeakerHeader = transcript.speaker_id !== prevSpeakerId
                    const speaker = speakers.find(
                      (s) => s.speaker_id === transcript.speaker_id,
                    )

                    const displayText =
                      draftTexts[transcript.id] ?? transcript.translated_text ?? ''
                    const isDirty = transcript.id in draftTexts
                    const isRegenerating = regenerating.has(transcript.id)
                    const isPlaying = playingId === transcript.id
                    const hasAudio = !!audioUrls[transcript.id]

                    return (
                      <div key={transcript.id}>
                        {/* Speaker header — shown only when speaker changes */}
                        {showSpeakerHeader && speaker && (
                          <div className="flex items-center gap-2 px-6 pt-4 pb-1">
                            {editingSpeakerId === speaker.id ? (
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
                                    if (e.key === 'Enter') void handleSpeakerSave(speaker)
                                    if (e.key === 'Escape') {
                                      setEditingSpeakerId(null)
                                      setSpeakerDrafts((prev) => {
                                        const next = { ...prev }
                                        delete next[speaker.id]
                                        return next
                                      })
                                    }
                                  }}
                                  onBlur={() => void handleSpeakerSave(speaker)}
                                  className="text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                />
                                {savingNameIds.has(speaker.id) && (
                                  <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingSpeakerId(speaker.id)
                                  setSpeakerDrafts((prev) => ({
                                    ...prev,
                                    [speaker.id]: speaker.speaker_name ?? '',
                                  }))
                                }}
                                className="flex items-center gap-1.5 group"
                              >
                                <span className="text-xs font-medium text-slate-500 px-2.5 py-1 bg-slate-100 rounded-md group-hover:bg-slate-200 transition-colors">
                                  {speaker.speaker_name ?? 'Unknown Speaker'}
                                </span>
                                <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Two-column segment row */}
                        <div className="grid grid-cols-2 gap-6 px-6 py-4">
                          {/* Left: original text — display only, no play button */}
                          <div className="space-y-1.5">
                            <p className="text-xs text-slate-400 font-mono tabular-nums">
                              {formatTime(transcript.start_time)} –{' '}
                              {formatTime(transcript.end_time)}
                            </p>
                            <p className="text-sm text-slate-600 leading-relaxed">
                              {transcript.original_text ?? ''}
                            </p>
                          </div>

                          {/* Right: translated text — editable */}
                          <div className="space-y-2">
                            <textarea
                              value={displayText}
                              onChange={(e) => onTextChange(transcript.id, e.target.value)}
                              rows={Math.max(2, Math.ceil((displayText.length || 1) / 55))}
                              className={`w-full text-sm text-slate-700 leading-relaxed bg-white border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none transition-colors ${
                                isDirty
                                  ? 'border-amber-300 bg-amber-50/50'
                                  : 'border-slate-200'
                              }`}
                            />
                            <div className="flex items-center gap-2">
                              {/* Play / Pause button */}
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

                              {/* Regenerate button */}
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
