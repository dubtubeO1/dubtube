'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { extractYouTubeId, isValidYouTubeUrl } from './utils/youtube'
import { Globe, Play, Sparkles, Zap, AlertCircle } from 'lucide-react'
import { useUser, useClerk } from '@clerk/nextjs'
import { stageFile } from '@/lib/staged-upload'
import VideoDropZone from '@/app/components/VideoDropZone'

type TurnstileWindow = Window & {
  onTurnstileSuccess?: (token: string) => void
  onTurnstileError?: () => void
  onTurnstileExpired?: () => void
}

type NetworkInfo = {
  effectiveType?: string
  downlink?: number
  rtt?: number
}

export default function Home() {
  const router = useRouter()
  const { isSignedIn, isLoaded } = useUser()
  const { openSignIn } = useClerk()

  // Tab: 'creators' is always active; 'viewers' tab is disabled (Coming Soon)
  const [activeTab] = useState<'creators' | 'viewers'>('creators')

  // Subscription status
  const [isActiveSubscriber, setIsActiveSubscriber] = useState(false)
  const [checkingSub, setCheckingSub] = useState(false)

  // Typing animation
  const [typedText, setTypedText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const fullText = 'DubTube'
  const subtitleText = 'Dub videos with perfect AI audio sync'

  // ── For Viewers tab state (YouTube — preserved, wired to disabled tab) ──
  const [url, setUrl] = useState('')
  const [language, setLanguage] = useState('es')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const turnstileRef = useRef<HTMLDivElement | null>(null)

  // Fetch subscription status when signed in
  useEffect(() => {
    const fetchSub = async () => {
      if (!isSignedIn) {
        setIsActiveSubscriber(false)
        return
      }
      setCheckingSub(true)
      try {
        const res = await fetch('/api/me/subscription')
        if (res.ok) {
          const data = (await res.json()) as { is_active?: boolean }
          setIsActiveSubscriber(Boolean(data?.is_active))
        } else {
          setIsActiveSubscriber(false)
        }
      } catch {
        setIsActiveSubscriber(false)
      } finally {
        setCheckingSub(false)
      }
    }
    if (isLoaded) fetchSub()
  }, [isLoaded, isSignedIn])

  // Typing animation
  useEffect(() => {
    if (currentIndex < fullText.length) {
      const timeout = setTimeout(() => {
        setTypedText(fullText.slice(0, currentIndex + 1))
        setCurrentIndex(currentIndex + 1)
      }, 150)
      return () => clearTimeout(timeout)
    }
  }, [currentIndex, fullText])

  // Load Turnstile only when viewers tab is active (currently never, tab is disabled)
  useEffect(() => {
    if (activeTab !== 'viewers') return

    const win = window as TurnstileWindow
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    document.head.appendChild(script)

    win.onTurnstileSuccess = onTurnstileSuccess
    win.onTurnstileError = onTurnstileError
    win.onTurnstileExpired = onTurnstileExpired

    return () => {
      const existing = document.querySelector(
        'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
      )
      if (existing) document.head.removeChild(existing)
      delete win.onTurnstileSuccess
      delete win.onTurnstileError
      delete win.onTurnstileExpired
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // ── Turnstile callbacks (For Viewers tab) ──
  const onTurnstileSuccess = (token: string) => {
    setTurnstileToken(token)
    setVerificationError(null)
  }

  const onTurnstileError = () => {
    setTurnstileToken(null)
    setVerificationError('Verification failed. Please try again.')
  }

  const onTurnstileExpired = () => {
    setTurnstileToken(null)
    setVerificationError('Verification expired. Please try again.')
  }

  const resetTurnstile = () => {
    setTurnstileToken(null)
    setVerificationError(null)
  }

  // ── Browser fingerprinting (For Viewers tab) ──
  const collectBrowserFingerprint = () => {
    try {
      const nav = navigator as Navigator & { connection?: NetworkInfo }

      const getWebGLString = (param: number): string => {
        try {
          const canvas = document.createElement('canvas')
          const gl =
            canvas.getContext('webgl') ??
            (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
          if (!gl) return 'Not Available'
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
          return debugInfo ? String(gl.getParameter(param)) : 'Unknown'
        } catch {
          return 'Error'
        }
      }

      const fingerprint = {
        userAgent: navigator.userAgent,
        screenResolution: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        platform: navigator.platform,
        colorDepth: screen.colorDepth,
        pixelRatio: window.devicePixelRatio,
        hardwareConcurrency: navigator.hardwareConcurrency,
        maxTouchPoints: navigator.maxTouchPoints,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        plugins: Array.from(navigator.plugins).map((p) => p.name),
        mimeTypes: Array.from(navigator.mimeTypes).map((m) => m.type),
        webglVendor: getWebGLString(0x9245 /* UNMASKED_VENDOR_WEBGL */),
        webglRenderer: getWebGLString(0x9246 /* UNMASKED_RENDERER_WEBGL */),
        connection: nav.connection
          ? {
              effectiveType: nav.connection.effectiveType,
              downlink: nav.connection.downlink,
              rtt: nav.connection.rtt,
            }
          : null,
        browserVersion: (() => {
          const ua = navigator.userAgent
          const match =
            ua.match(/Chrome\/(\d+)/) ??
            ua.match(/Firefox\/(\d+)/) ??
            ua.match(/Version\/(\d+)/) ??
            ua.match(/Edge\/(\d+)/)
          const browser = ua.includes('Chrome')
            ? 'Chrome'
            : ua.includes('Firefox')
              ? 'Firefox'
              : ua.includes('Safari')
                ? 'Safari'
                : ua.includes('Edge')
                  ? 'Edge'
                  : 'Unknown'
          return match ? `${browser} ${match[1]}` : `${browser} Unknown`
        })(),
        timestamp: Date.now(),
      }
      return fingerprint
    } catch {
      console.error('Error collecting browser fingerprint')
      return null
    }
  }

  // ── For Creators tab: handle file drop/select ──
  const handleFile = (file: File) => {
    if (!isLoaded) return
    if (!isSignedIn) {
      openSignIn()
      return
    }
    if (checkingSub) return // subscription status still loading
    if (!isActiveSubscriber) {
      router.push('/pricing')
      return
    }
    stageFile(file)
    router.push('/dashboard/new')
  }

  // ── For Viewers tab: handle YouTube form submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setVerificationError(null)

    if (!isSignedIn) return
    if (!isActiveSubscriber) {
      router.push('/pricing#pricing-cards')
      return
    }

    if (!isValidYouTubeUrl(url)) {
      setError('Please enter a valid YouTube URL')
      return
    }

    const videoId = extractYouTubeId(url)
    if (!videoId) {
      setError('Could not extract video ID from URL')
      return
    }

    if (!turnstileToken) {
      setVerificationError('Please complete the verification')
      return
    }

    setIsLoading(true)
    setIsVerifying(true)

    try {
      const browserFingerprint = collectBrowserFingerprint()
      if (!browserFingerprint) {
        setError('Unable to collect browser information. Please try again.')
        return
      }

      const response = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: turnstileToken,
          remoteip: null,
          browserFingerprint,
          videoId,
          language,
        }),
      })

      const result = (await response.json()) as {
        success: boolean
        error?: string
        data?: { videoId: string; language: string; browserFingerprint: unknown }
      }

      if (!result.success) {
        setVerificationError(result.error ?? 'Verification failed. Please try again.')
        resetTurnstile()
        return
      }

      const extractResponse = await fetch('/api/extract-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: result.data?.videoId,
          language: result.data?.language,
          browserFingerprint: result.data?.browserFingerprint,
          clientIP: 'unknown',
        }),
      })

      if (!extractResponse.ok) {
        const extractError = (await extractResponse.json().catch(() => ({}))) as {
          error?: string
        }
        setError(extractError.error ?? 'Failed to start audio extraction process')
        resetTurnstile()
        return
      }

      // Consume NDJSON stream
      const reader = extractResponse.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let extractErr: string | null = null
      let done = false

      if (reader) {
        while (true) {
          const { done: streamDone, value } = await reader.read()
          if (streamDone) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const event = JSON.parse(line) as {
                status: string
                audioUrl?: string
                error?: string
              }
              if (event.status === 'done') done = true
              else if (event.status === 'error') extractErr = event.error ?? 'Extraction failed'
            } catch {
              /* skip malformed lines */
            }
          }
          if (done || extractErr) break
        }
      }

      if (extractErr) {
        setError(extractErr)
        resetTurnstile()
        return
      }
      if (!done) {
        setError('Failed to extract audio')
        resetTurnstile()
        return
      }

      router.push(`/video/${videoId}?lang=${language}`)
    } catch {
      setError('Failed to process video. Please try again.')
      resetTurnstile()
    } finally {
      setIsLoading(false)
      setIsVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 relative overflow-hidden">
      {/* Floating background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Header */}
          <div className="space-y-6">
            <h1 className="text-6xl md:text-8xl font-bold">
              <span className="bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 bg-clip-text text-transparent animate-gradient">
                {typedText}
              </span>
            </h1>
            <p className="text-3xl md:text-5xl font-light text-slate-600">{subtitleText}</p>
          </div>

          {/* Tab buttons */}
          <div className="flex items-center justify-center space-x-3">
            <button className="px-6 py-2.5 rounded-xl text-sm font-medium bg-slate-700 text-white shadow-md">
              For Creators
            </button>
            <div className="relative">
              <button
                disabled
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-slate-400 bg-white/70 border border-slate-200 cursor-not-allowed"
              >
                For Viewers
              </button>
              <span className="absolute -top-2.5 -right-2.5 text-xs bg-slate-200 text-slate-500 rounded-full px-1.5 py-0.5 font-medium leading-none">
                Soon
              </span>
            </div>
          </div>

          {/* Tab content */}
          <div className="max-w-2xl mx-auto w-full">
            {/* ── For Creators ── */}
            {activeTab === 'creators' && (
              <div className="space-y-4">
                <VideoDropZone onFile={handleFile} />

                {/* Format pills */}
                <div className="flex items-center justify-center flex-wrap gap-2">
                  {['MP4', 'MOV', 'AVI', 'MKV', 'WebM'].map((fmt) => (
                    <span
                      key={fmt}
                      className="px-3 py-1 bg-slate-100 text-slate-500 text-xs rounded-full font-medium border border-slate-200"
                    >
                      {fmt}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── For Viewers (preserved, currently inaccessible — Coming Soon) ── */}
            {activeTab === 'viewers' && (
              <div className="pointer-events-none opacity-50">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* URL Input */}
                  <div className="space-y-3">
                    <label
                      htmlFor="url"
                      className="block text-sm font-medium text-slate-700 text-left"
                    >
                      YouTube URL
                    </label>
                    <input
                      type="url"
                      id="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      required
                      className="w-full px-6 py-4 rounded-2xl border border-slate-300 focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white/70 backdrop-blur-sm text-slate-900 placeholder-slate-400 transition-all duration-300 hover:shadow-md"
                    />
                    {error && <p className="text-red-500 text-sm text-left">{error}</p>}
                  </div>

                  {/* Language Selector */}
                  <div className="space-y-3">
                    <label
                      htmlFor="language"
                      className="block text-sm font-medium text-slate-700 text-left"
                    >
                      Target Language
                    </label>
                    <select
                      id="language"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full px-6 py-4 rounded-2xl border border-slate-300 focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white/70 backdrop-blur-sm text-slate-900 transition-all duration-300 hover:shadow-md"
                    >
                      <option value="en">English</option>
                      <option value="tr">Turkish</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="it">Italian</option>
                      <option value="pt">Portuguese</option>
                      <option value="ru">Russian</option>
                      <option value="ja">Japanese</option>
                      <option value="ko">Korean</option>
                      <option value="zh">Chinese</option>
                    </select>
                  </div>

                  {/* Turnstile Widget */}
                  <div className="space-y-3">
                    <div className="flex justify-center">
                      <div
                        ref={turnstileRef}
                        className="cf-turnstile"
                        data-sitekey={process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY}
                        data-callback="onTurnstileSuccess"
                        data-error-callback="onTurnstileError"
                        data-expired-callback="onTurnstileExpired"
                        data-theme="light"
                        data-size="normal"
                      />
                    </div>
                    {verificationError && (
                      <div className="flex items-center space-x-2 text-red-500 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>{verificationError}</span>
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading || !turnstileToken}
                    className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-slate-700 to-slate-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center space-x-3">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>{isVerifying ? 'Verifying...' : 'Processing...'}</span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-center space-x-3">
                        <Play className="w-5 h-5" />
                        <span>Translate Video</span>
                      </span>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Pricing CTA */}
            <div className="mt-6">
              <button
                onClick={() => router.push('/pricing#pricing-cards')}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-slate-600 to-slate-500 text-white font-medium hover:from-slate-700 hover:to-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                <span className="flex items-center justify-center space-x-3">
                  <Sparkles className="w-5 h-5" />
                  <span>View Pricing Plans</span>
                </span>
              </button>
            </div>
          </div>

          {/* Divider with dots */}
          <div className="flex items-center justify-center space-x-4">
            <div className="w-16 h-px bg-gradient-to-r from-transparent to-slate-300" />
            <div className="w-2 h-2 bg-slate-400 rounded-full" />
            <div className="w-2 h-2 bg-slate-400 rounded-full" />
            <div className="w-2 h-2 bg-slate-400 rounded-full" />
            <div className="w-16 h-px bg-gradient-to-l from-transparent to-slate-300" />
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <div className="flex flex-col items-center space-y-3 p-6 rounded-2xl bg-white/50 backdrop-blur-sm border border-slate-200 hover:shadow-lg transition-all duration-300">
              <Globe className="w-8 h-8 text-slate-600" />
              <h3 className="text-lg font-medium text-slate-700">Multi-Language</h3>
              <p className="text-sm text-slate-500 font-light text-center">
                Support for 32 languages with perfect translation
              </p>
            </div>
            <div className="flex flex-col items-center space-y-3 p-6 rounded-2xl bg-white/50 backdrop-blur-sm border border-slate-200 hover:shadow-lg transition-all duration-300">
              <Zap className="w-8 h-8 text-slate-600" />
              <h3 className="text-lg font-medium text-slate-700">Perfect Sync</h3>
              <p className="text-sm text-slate-500 font-light text-center">
                Audio synchronization with original video timing
              </p>
            </div>
            <div className="flex flex-col items-center space-y-3 p-6 rounded-2xl bg-white/50 backdrop-blur-sm border border-slate-200 hover:shadow-lg transition-all duration-300">
              <Sparkles className="w-8 h-8 text-slate-600" />
              <h3 className="text-lg font-medium text-slate-700">AI Voice</h3>
              <p className="text-sm text-slate-500 font-light text-center">
                Advanced voice cloning and natural speech
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
