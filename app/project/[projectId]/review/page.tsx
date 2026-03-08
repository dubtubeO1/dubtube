'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  Download,
  RefreshCw,
  Link2,
  Link2Off,
  GripVertical,
  CheckCircle,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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
  segment_audio_r2_key: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000
const TERMINAL_STATUSES = new Set<ProjectStatus>(['delivered', 'error'])

const SPEAKER_COLORS: Record<number, string> = {
  0: 'bg-blue-50 border-blue-200 text-blue-800',
  1: 'bg-violet-50 border-violet-200 text-violet-800',
  2: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  3: 'bg-amber-50 border-amber-200 text-amber-800',
  4: 'bg-rose-50 border-rose-200 text-rose-800',
  5: 'bg-cyan-50 border-cyan-200 text-cyan-800',
}

function getSpeakerColor(speakerId: string | null): string {
  if (!speakerId) return SPEAKER_COLORS[0]
  const index = parseInt(speakerId.replace(/\D/g, ''), 10)
  return SPEAKER_COLORS[isNaN(index) ? 0 : index % 6]
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── Sortable segment block ───────────────────────────────────────────────────

interface SegmentBlockProps {
  segment: TranscriptRow
  audioUrl: string | undefined
  isPlaying: boolean
  onPlay: (id: string) => void
}

function SortableSegmentBlock({ segment, audioUrl, isPlaying, onPlay }: SegmentBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: segment.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const colorClass = getSpeakerColor(segment.speaker_id)
  const duration =
    segment.start_time !== null && segment.end_time !== null
      ? (segment.end_time - segment.start_time).toFixed(1)
      : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex-shrink-0 w-40 rounded-xl border-2 ${colorClass} shadow-sm select-none`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center gap-1 py-2 cursor-grab active:cursor-grabbing border-b border-current border-opacity-10"
      >
        <GripVertical className="w-4 h-4 opacity-40" />
        <span className="text-xs opacity-40 font-medium">drag</span>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <p className="text-xs font-semibold truncate">
          {segment.speaker_name ?? segment.speaker_id ?? 'Unknown'}
        </p>
        <p className="text-xs font-mono opacity-60 tabular-nums">
          {formatTime(segment.start_time)} – {formatTime(segment.end_time)}
        </p>
        {duration !== null && (
          <p className="text-xs opacity-50">{duration}s</p>
        )}
        <button
          onClick={() => onPlay(segment.id)}
          disabled={!audioUrl}
          className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-white/70 hover:bg-white transition-colors text-xs font-medium border border-current border-opacity-10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPlaying ? (
            <Pause className="w-3 h-3" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams()
  const projectId = params.projectId as string

  // ── Data state ──
  const [project, setProject] = useState<Project | null>(null)
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([])
  const [segmentOrder, setSegmentOrder] = useState<string[]>([])
  const [originalOrder, setOriginalOrder] = useState<string[]>([])
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [dubbedAudioUrl, setDubbedAudioUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── UI state ──
  const [remixing, setRemixing] = useState(false)
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null)
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // ── Refs ──
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const dubbedRef = useRef<HTMLAudioElement | null>(null)
  const segmentAudioRef = useRef<HTMLAudioElement | null>(null)
  const contentLoadedRef = useRef(false)

  // ─── Fetching ──────────────────────────────────────────────────────────────

  const fetchVideoUrl = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/video-url`)
      if (!res.ok) return
      const data = (await res.json()) as { url: string }
      setVideoUrl(data.url)
    } catch { /* non-fatal */ }
  }, [projectId])

  const fetchAudioUrls = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/audio-urls`)
      if (!res.ok) return
      const data = (await res.json()) as { urls: Record<string, string> }
      setAudioUrls(data.urls)
    } catch { /* non-fatal */ }
  }, [projectId])

  const fetchDubbedAudioUrl = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/dubbed-audio-url`)
      if (!res.ok) return
      const data = (await res.json()) as { url: string }
      setDubbedAudioUrl(data.url)
    } catch { /* non-fatal */ }
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
      }
      setProject(data.project)

      if (data.project.status === 'delivered' && !contentLoadedRef.current) {
        contentLoadedRef.current = true
        const ids = data.transcripts.map((t) => t.id)
        setTranscripts(data.transcripts)
        setSegmentOrder(ids)
        setOriginalOrder(ids)
        void fetchAudioUrls()
        void fetchVideoUrl()
      }
    } catch {
      setLoadError('Network error — could not load project')
    }
  }, [projectId, fetchAudioUrls, fetchVideoUrl])

  useEffect(() => { void fetchProject() }, [fetchProject])

  // Poll until terminal status
  useEffect(() => {
    if (!project) return
    if (TERMINAL_STATUSES.has(project.status)) return
    const timer = setInterval(() => { void fetchProject() }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [project, fetchProject])

  // Fetch dubbed audio URL whenever project is delivered and we don't have it yet
  useEffect(() => {
    if (project?.status === 'delivered' && !dubbedAudioUrl) {
      void fetchDubbedAudioUrl()
    }
  }, [project?.status, dubbedAudioUrl, fetchDubbedAudioUrl])

  // ─── Sync mode ────────────────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current
    const audio = dubbedRef.current
    if (!video || !audio || !syncEnabled) return

    const onVideoPlay = () => {
      if (!audio.paused) return
      audio.currentTime = video.currentTime
      void audio.play()
    }
    const onVideoPause = () => {
      if (audio.paused) return
      audio.pause()
    }
    const onVideoSeeked = () => {
      if (Math.abs(audio.currentTime - video.currentTime) < 0.15) return
      audio.currentTime = video.currentTime
    }
    const onVideoEnded = () => { audio.pause() }

    const onAudioPlay = () => {
      if (!video.paused) return
      video.currentTime = audio.currentTime
      void video.play()
    }
    const onAudioPause = () => {
      if (video.paused) return
      video.pause()
    }
    const onAudioSeeked = () => {
      if (Math.abs(video.currentTime - audio.currentTime) < 0.15) return
      video.currentTime = audio.currentTime
    }
    const onAudioEnded = () => { video.pause() }

    video.addEventListener('play', onVideoPlay)
    video.addEventListener('pause', onVideoPause)
    video.addEventListener('seeked', onVideoSeeked)
    video.addEventListener('ended', onVideoEnded)
    audio.addEventListener('play', onAudioPlay)
    audio.addEventListener('pause', onAudioPause)
    audio.addEventListener('seeked', onAudioSeeked)
    audio.addEventListener('ended', onAudioEnded)

    return () => {
      video.removeEventListener('play', onVideoPlay)
      video.removeEventListener('pause', onVideoPause)
      video.removeEventListener('seeked', onVideoSeeked)
      video.removeEventListener('ended', onVideoEnded)
      audio.removeEventListener('play', onAudioPlay)
      audio.removeEventListener('pause', onAudioPause)
      audio.removeEventListener('seeked', onAudioSeeked)
      audio.removeEventListener('ended', onAudioEnded)
    }
  }, [syncEnabled, videoUrl, dubbedAudioUrl])

  // ─── Segment playback ─────────────────────────────────────────────────────

  const handlePlaySegment = useCallback(
    (segmentId: string) => {
      const url = audioUrls[segmentId]
      if (!url) return

      if (playingSegmentId === segmentId) {
        segmentAudioRef.current?.pause()
        segmentAudioRef.current = null
        setPlayingSegmentId(null)
        return
      }

      segmentAudioRef.current?.pause()
      segmentAudioRef.current = null

      const audio = new Audio(url)
      segmentAudioRef.current = audio
      setPlayingSegmentId(segmentId)
      audio.onended = () => { setPlayingSegmentId(null); segmentAudioRef.current = null }
      audio.onerror = () => { setPlayingSegmentId(null); segmentAudioRef.current = null }
      void audio.play()
    },
    [audioUrls, playingSegmentId],
  )

  // ─── Drag & Drop ──────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSegmentOrder((prev) => {
      const oldIndex = prev.indexOf(active.id as string)
      const newIndex = prev.indexOf(over.id as string)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }, [])

  const orderChanged =
    segmentOrder.length > 0 && segmentOrder.some((id, i) => id !== originalOrder[i])

  // ─── Remix ────────────────────────────────────────────────────────────────

  const handleRemix = useCallback(async () => {
    setRemixing(true)
    const prevStatus = project?.status ?? 'delivered'
    try {
      // Optimistic update — triggers polling restart
      setProject((prev) => (prev ? { ...prev, status: 'delivering' } : prev))
      setDubbedAudioUrl(null)

      const res = await fetch(`/api/projects/${projectId}/remix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentOrder }),
      })

      if (!res.ok) {
        // Revert on failure
        setProject((prev) => (prev ? { ...prev, status: prevStatus as ProjectStatus } : prev))
        return
      }

      // After successful remix, the new order becomes the baseline
      setOriginalOrder([...segmentOrder])
    } catch {
      setProject((prev) => (prev ? { ...prev, status: prevStatus as ProjectStatus } : prev))
    } finally {
      setRemixing(false)
    }
  }, [project?.status, projectId, segmentOrder])

  // ─── Download ─────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    if (!dubbedAudioUrl) return
    setDownloading(true)
    try {
      const res = await fetch(dubbedAudioUrl)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${project?.title ?? 'dubbed_audio'}.mp3`
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch { /* silent fail */ } finally {
      setDownloading(false)
    }
  }, [dubbedAudioUrl, project?.title])

  // ─── Render ───────────────────────────────────────────────────────────────

  const isDelivering = project?.status === 'delivering'
  const isDelivered = project?.status === 'delivered'
  const isError = project?.status === 'error'
  const isEarlyStatus =
    project !== null &&
    !['delivering', 'delivered', 'error'].includes(project.status)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-10">

        {/* ── Loading skeleton ── */}
        {!project && !loadError && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        )}

        {/* ── Load error ── */}
        {loadError && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-8 space-y-4 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
            <p className="text-slate-600">{loadError}</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>
        )}

        {/* ── Project not yet delivered ── */}
        {isEarlyStatus && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-8 space-y-4 text-center">
            <p className="text-slate-500 text-sm">Dubbed audio has not been generated yet.</p>
            <Link
              href={`/project/${projectId}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Transcript
            </Link>
          </div>
        )}

        {/* ── Error state ── */}
        {isError && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-8 space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium mb-0.5">Audio generation failed</p>
                <p className="text-red-600">{project?.error_message ?? 'An unexpected error occurred.'}</p>
              </div>
            </div>
            <Link
              href={`/project/${projectId}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Transcript
            </Link>
          </div>
        )}

        {/* ── Delivering (loading) state ── */}
        {isDelivering && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-10 space-y-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
              </div>
              <div>
                <p className="font-semibold text-slate-700">Mixing audio tracks…</p>
                <p className="text-sm text-slate-400 mt-1">
                  Combining all dubbed segments into the final audio. This usually takes under a minute.
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              You can close this page — the mix will continue in the background.
            </p>
            <Link
              href={`/project/${projectId}`}
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Transcript
            </Link>
          </div>
        )}

        {/* ── Delivered (full review UI) ── */}
        {isDelivered && (
          <div className="space-y-5">

            {/* Header */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg px-6 py-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Link
                  href={`/project/${projectId}`}
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Transcript
                </Link>
                <span className="text-slate-300">/</span>
                <div className="min-w-0">
                  <h1 className="text-sm font-semibold text-slate-700 truncate">{project?.title}</h1>
                  {project?.target_language && (
                    <p className="text-xs text-slate-400">
                      {project.source_language
                        ? `${project.source_language} → ${project.target_language}`
                        : `→ ${project.target_language}`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="inline-flex items-center gap-1.5 text-xs text-green-600 font-medium">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Dubbed audio ready
                </span>
                <button
                  onClick={() => void handleDownload()}
                  disabled={!dubbedAudioUrl || downloading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Download MP3
                </button>
              </div>
            </div>

            {/* Video + dubbed audio players */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
              {videoUrl && (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  preload="metadata"
                  playsInline
                  className="w-full max-h-80 bg-black"
                />
              )}

              <div className="px-5 py-4 space-y-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Dubbed Audio
                  </p>
                  {videoUrl && (
                    <button
                      onClick={() => setSyncEnabled((v) => !v)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        syncEnabled
                          ? 'bg-slate-700 text-white hover:bg-slate-800'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {syncEnabled ? (
                        <Link2 className="w-3.5 h-3.5" />
                      ) : (
                        <Link2Off className="w-3.5 h-3.5" />
                      )}
                      {syncEnabled ? 'Sync on' : 'Sync off'}
                    </button>
                  )}
                </div>

                {dubbedAudioUrl ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio
                    ref={dubbedRef}
                    src={dubbedAudioUrl}
                    controls
                    preload="metadata"
                    className="w-full h-10"
                  />
                ) : (
                  <div className="flex items-center gap-2 py-3">
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                    <p className="text-sm text-slate-400">Loading audio…</p>
                  </div>
                )}
              </div>
            </div>

            {/* Audio timeline editor */}
            {transcripts.length > 0 && (
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Audio Timeline</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Drag segments to reorder, then regenerate the mix.
                    </p>
                  </div>
                  {orderChanged && (
                    <button
                      onClick={() => void handleRemix()}
                      disabled={remixing}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {remixing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Regenerate Mix
                    </button>
                  )}
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={segmentOrder}
                    strategy={horizontalListSortingStrategy}
                  >
                    <div className="flex gap-3 overflow-x-auto pb-2 pt-1">
                      {segmentOrder.map((id) => {
                        const segment = transcripts.find((t) => t.id === id)
                        if (!segment) return null
                        return (
                          <SortableSegmentBlock
                            key={id}
                            segment={segment}
                            audioUrl={audioUrls[id]}
                            isPlaying={playingSegmentId === id}
                            onPlay={handlePlaySegment}
                          />
                        )
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
