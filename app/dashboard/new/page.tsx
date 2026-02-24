'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { ArrowLeft, Check, FileVideo, X, AlertCircle } from 'lucide-react'
import VideoDropZone from '@/app/components/VideoDropZone'
import { LANGUAGES } from '@/lib/languages'
import { getStagedFile, clearStagedFile } from '@/lib/staged-upload'

type Step = 'upload' | 'uploading' | 'language'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function NewProjectPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()

  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sourceLanguage, setSourceLanguage] = useState<string>('')
  const [targetLanguage, setTargetLanguage] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  // Gate: check active subscription on page load
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    fetch('/api/me/subscription')
      .then((r) => r.json())
      .then((data: { is_active?: boolean }) => {
        if (!data?.is_active) router.replace('/pricing')
      })
      .catch(() => {})
  }, [isLoaded, isSignedIn, router])

  // Pre-populate staged file from homepage
  useEffect(() => {
    const staged = getStagedFile()
    if (staged) {
      setFile(staged)
      clearStagedFile()
    }
  }, [])

  // Auto-start upload when a file is pre-populated from staged upload
  const hasAutoStarted = useRef(false)
  useEffect(() => {
    if (file && step === 'upload' && !hasAutoStarted.current) {
      hasAutoStarted.current = true
      startUpload(file)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const startUpload = useCallback(
    async (uploadFile: File) => {
      setError(null)
      setStep('uploading')
      setUploadProgress(0)

      // Get presigned URL and create project record
      let uploadUrl: string
      let pid: string
      try {
        const res = await fetch('/api/upload/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: uploadFile.name,
            fileSize: uploadFile.size,
            contentType: uploadFile.type,
          }),
        })

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          if (res.status === 402) {
            router.replace('/pricing')
            return
          }
          setError(err.error ?? 'Failed to start upload. Please try again.')
          setStep('upload')
          return
        }

        const data = (await res.json()) as { uploadUrl: string; projectId: string; r2Key: string }
        uploadUrl = data.uploadUrl
        pid = data.projectId
        setProjectId(pid)
      } catch {
        setError('Network error. Please check your connection and try again.')
        setStep('upload')
        return
      }

      // Upload directly to R2 via XHR for progress tracking
      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
      }

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Mark project as ready
          try {
            await fetch(`/api/projects/${pid}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'ready' }),
            })
          } catch {
            // Non-fatal — proceed to language selection regardless
          }
          setStep('language')
        } else {
          setError(`Upload failed (status ${xhr.status}). Please try again.`)
          setStep('upload')
        }
      }

      xhr.onerror = () => {
        setError('Upload failed. Please check your connection and try again.')
        setStep('upload')
      }

      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', uploadFile.type)
      xhr.send(uploadFile)
    },
    [router],
  )

  const handleFileSelected = useCallback(
    (f: File) => {
      setFile(f)
      hasAutoStarted.current = true
      startUpload(f)
    },
    [startUpload],
  )

  const handleReset = () => {
    xhrRef.current?.abort()
    xhrRef.current = null
    setFile(null)
    setStep('upload')
    setUploadProgress(0)
    setProjectId(null)
    setError(null)
    hasAutoStarted.current = false
  }

  const handleStartProcessing = async () => {
    if (!projectId || !targetLanguage || isSubmitting) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_language: sourceLanguage || null,
          target_language: targetLanguage,
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        setError(err.error ?? 'Failed to start processing. Please try again.')
        setIsSubmitting(false)
        return
      }
      router.push(`/project/${projectId}`)
    } catch {
      setError('Network error. Please try again.')
      setIsSubmitting(false)
    }
  }

  // Loading while Clerk resolves
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 relative overflow-hidden">
      {/* Floating background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-16">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center space-x-2 text-slate-500 hover:text-slate-700 transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Dashboard</span>
        </Link>

        {/* Step indicator */}
        <div className="flex items-center space-x-3 mb-8">
          <div
            className={`flex items-center space-x-2 text-sm font-medium ${step === 'language' ? 'text-slate-400' : 'text-slate-700'}`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'language' ? 'bg-green-500 text-white' : 'bg-slate-700 text-white'}`}
            >
              {step === 'language' ? <Check className="w-3 h-3" /> : '1'}
            </div>
            <span>Upload Video</span>
          </div>
          <div className="w-8 h-px bg-slate-300" />
          <div
            className={`flex items-center space-x-2 text-sm font-medium ${step === 'language' ? 'text-slate-700' : 'text-slate-400'}`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'language' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-500'}`}
            >
              2
            </div>
            <span>Select Languages</span>
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-lg p-8 space-y-6">
          {/* ── Step 1: Upload ── */}
          {(step === 'upload' || step === 'uploading') && (
            <>
              <div>
                <h1 className="text-2xl font-bold text-slate-700">Upload Your Video</h1>
                <p className="text-slate-500 text-sm mt-1">Max file size: 3 GB · MP4, MOV, AVI, MKV, WebM</p>
              </div>

              {error && (
                <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1">{error}</div>
                  <button onClick={() => setError(null)} className="shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {step === 'upload' && (
                <VideoDropZone onFile={handleFileSelected} />
              )}

              {step === 'uploading' && file && (
                <div className="space-y-4">
                  {/* File info */}
                  <div className="flex items-center space-x-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="p-2 bg-slate-100 rounded-lg shrink-0">
                      <FileVideo className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                      <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                    </div>
                    <button
                      onClick={handleReset}
                      className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                      title="Cancel upload"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Uploading…</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-slate-600 to-slate-500 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Language Selection ── */}
          {step === 'language' && (
            <>
              <div>
                <h1 className="text-2xl font-bold text-slate-700">Select Languages</h1>
                <p className="text-slate-500 text-sm mt-1">
                  Choose the source and target language for dubbing.
                </p>
              </div>

              {error && (
                <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1">{error}</div>
                  <button onClick={() => setError(null)} className="shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {file && (
                <div className="flex items-center space-x-3 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                  <Check className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    <span className="font-medium">{file.name}</span> uploaded successfully
                  </span>
                </div>
              )}

              <div className="space-y-5">
                {/* Source language */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Source Language
                  </label>
                  <select
                    value={sourceLanguage}
                    onChange={(e) => setSourceLanguage(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white/70 backdrop-blur-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all"
                  >
                    <option value="">Auto-detect</option>
                    {LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400">
                    Leave as Auto-detect to let the AI identify the spoken language.
                  </p>
                </div>

                {/* Target language */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Target Language <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white/70 backdrop-blur-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all"
                  >
                    <option value="" disabled>
                      Select target language
                    </option>
                    {LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Start Processing */}
                <button
                  onClick={handleStartProcessing}
                  disabled={!targetLanguage || isSubmitting}
                  className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-slate-700 to-slate-600 text-white font-medium hover:from-slate-800 hover:to-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-[1.01] shadow-lg hover:shadow-xl"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Starting…</span>
                    </span>
                  ) : (
                    'Start Processing'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
