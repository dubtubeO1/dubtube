'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { extractYouTubeId, isValidYouTubeUrl } from './utils/youtube';
import { Globe, Play, Sparkles, Zap, CheckCircle, AlertCircle } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('es');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedText, setTypedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const turnstileRef = useRef<any>(null);

  // Browser fingerprinting function
  const collectBrowserFingerprint = () => {
    try {
      const fingerprint = {
        // Essential browser data
        userAgent: navigator.userAgent,
        screenResolution: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        platform: navigator.platform,
        
        // Advanced browser data
        colorDepth: screen.colorDepth,
        pixelRatio: window.devicePixelRatio,
        hardwareConcurrency: navigator.hardwareConcurrency,
        maxTouchPoints: navigator.maxTouchPoints,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        
        // Browser capabilities
        plugins: Array.from(navigator.plugins).map(p => p.name),
        mimeTypes: Array.from(navigator.mimeTypes).map(m => m.type),
        
        // WebGL info (if available)
        webglVendor: (() => {
          try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
            if (gl) {
              const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
              return debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown';
            }
            return 'Not Available';
          } catch (e) {
            return 'Error';
          }
        })(),
        
        webglRenderer: (() => {
          try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
            if (gl) {
              const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
              return debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';
            }
            return 'Not Available';
          } catch (e) {
            return 'Error';
          }
        })(),
        
        // Network info (if available)
        connection: (navigator as any).connection ? {
          effectiveType: (navigator as any).connection.effectiveType,
          downlink: (navigator as any).connection.downlink,
          rtt: (navigator as any).connection.rtt
        } : null,
        
        // Browser version detection
        browserVersion: (() => {
          const ua = navigator.userAgent;
          if (ua.includes('Chrome')) {
            const match = ua.match(/Chrome\/(\d+)/);
            return match ? `Chrome ${match[1]}` : 'Chrome Unknown';
          } else if (ua.includes('Firefox')) {
            const match = ua.match(/Firefox\/(\d+)/);
            return match ? `Firefox ${match[1]}` : 'Firefox Unknown';
          } else if (ua.includes('Safari')) {
            const match = ua.match(/Version\/(\d+)/);
            return match ? `Safari ${match[1]}` : 'Safari Unknown';
          } else if (ua.includes('Edge')) {
            const match = ua.match(/Edge\/(\d+)/);
            return match ? `Edge ${match[1]}` : 'Edge Unknown';
          }
          return 'Unknown Browser';
        })(),
        
        // Timestamp for freshness
        timestamp: Date.now()
      };
      
      return fingerprint;
    } catch (error) {
      console.error('Error collecting browser fingerprint:', error);
      return null;
    }
  };

  const fullText = "DubTube";
  const subtitleText = "Translate YouTube videos with perfect audio sync";

  // Typing animation effect
  useEffect(() => {
    if (currentIndex < fullText.length) {
      const timeout = setTimeout(() => {
        setTypedText(fullText.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, 150);
      return () => clearTimeout(timeout);
    }
  }, [currentIndex, fullText]);

  // Load Turnstile script and set up global callbacks
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    // Set up global callback functions
    (window as any).onTurnstileSuccess = onTurnstileSuccess;
    (window as any).onTurnstileError = onTurnstileError;
    (window as any).onTurnstileExpired = onTurnstileExpired;

    return () => {
      // Cleanup script and global callbacks on unmount
      const existingScript = document.querySelector('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
      delete (window as any).onTurnstileSuccess;
      delete (window as any).onTurnstileError;
      delete (window as any).onTurnstileExpired;
    };
  }, []);

  // Turnstile callback functions
  const onTurnstileSuccess = (token: string) => {
    setTurnstileToken(token);
    setVerificationError(null);
  };

  const onTurnstileError = () => {
    setTurnstileToken(null);
    setVerificationError('Verification failed. Please try again.');
  };

  const onTurnstileExpired = () => {
    setTurnstileToken(null);
    setVerificationError('Verification expired. Please try again.');
  };

  const resetTurnstile = () => {
    if (turnstileRef.current) {
      turnstileRef.current.reset();
    }
    setTurnstileToken(null);
    setVerificationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setVerificationError(null);

    // Validate YouTube URL
    if (!isValidYouTubeUrl(url)) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    const videoId = extractYouTubeId(url);
    if (!videoId) {
      setError('Could not extract video ID from URL');
      return;
    }

    // Check if Turnstile token exists
    if (!turnstileToken) {
      setVerificationError('Please complete the verification');
      return;
    }

    setIsLoading(true);
    setIsVerifying(true);

    try {
      // Collect browser fingerprint
      const browserFingerprint = collectBrowserFingerprint();
      
      if (!browserFingerprint) {
        setError('Unable to collect browser information. Please try again.');
        return;
      }

      // Verify Turnstile token with server and send browser fingerprint
      const response = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: turnstileToken,
          remoteip: null, // Let server determine IP
          browserFingerprint: browserFingerprint,
          videoId: videoId,
          language: language
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setVerificationError(result.error || 'Verification failed. Please try again.');
        resetTurnstile();
        return;
      }

      // Verification successful, proceed to video page
      router.push(`/video/${videoId}?lang=${language}`);
    } catch (err) {
      setError('Failed to process video. Please try again.');
      console.error(err);
      resetTurnstile();
    } finally {
      setIsLoading(false);
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 relative overflow-hidden">
      {/* Floating background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Header */}
          <div className="space-y-6">
            {/* Main title with typing animation */}
            <h1 className="text-6xl md:text-8xl font-bold">
              <span className="bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 bg-clip-text text-transparent animate-gradient">
                {typedText}
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-3xl md:text-5xl font-light text-slate-600">
              {subtitleText}
            </p>
          </div>

          {/* Main form */}
          <div className="max-w-2xl mx-auto w-full">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* URL Input */}
              <div className="space-y-3">
                <label htmlFor="url" className="block text-sm font-medium text-slate-700 text-left">
                  YouTube URL
                </label>
                <input
                  type="url"
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  required
                  className="w-full px-6 py-4 rounded-2xl border border-slate-300 
                           focus:ring-2 focus:ring-slate-500 focus:border-transparent
                           bg-white/70 backdrop-blur-sm
                           text-slate-900 placeholder-slate-400
                           transition-all duration-300 hover:shadow-md"
                />
                {error && (
                  <p className="text-red-500 text-sm text-left">{error}</p>
                )}
              </div>

              {/* Language Selector */}
              <div className="space-y-3">
                <label htmlFor="language" className="block text-sm font-medium text-slate-700 text-left">
                  Target Language
                </label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-6 py-4 rounded-2xl border border-slate-300
                           focus:ring-2 focus:ring-slate-500 focus:border-transparent
                           bg-white/70 backdrop-blur-sm
                           text-slate-900
                           transition-all duration-300 hover:shadow-md"
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
                disabled={true}
                type="submit"
                //disabled={isLoading || !turnstileToken}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-slate-700 to-slate-600 
                         text-white font-medium hover:from-slate-800 hover:to-slate-700
                         focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-300 transform hover:scale-105
                         shadow-lg hover:shadow-xl"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center space-x-3">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{isVerifying ? 'Verifying...' : 'Processing...'}</span>
                  </span>
                ) : !turnstileToken ? (
                  <span className="flex items-center justify-center space-x-3">
                    <AlertCircle className="w-5 h-5" />
                    <span>Complete Verification</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center space-x-3">
                    <Play className="w-5 h-5" />
                    <span>Translate Video</span>
                  </span>
                )}
              </button>
            </form>

            {/* Call to action */}
            <div className="mt-6">
              <button
                onClick={() => router.push('/pricing#pricing-cards')}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-slate-600 to-slate-500 
                         text-white font-medium hover:from-slate-700 hover:to-slate-600
                         focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2
                         transition-all duration-300 transform hover:scale-105
                         shadow-lg hover:shadow-xl"
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
            <div className="w-16 h-px bg-gradient-to-r from-transparent to-slate-300"></div>
            <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
            <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
            <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
            <div className="w-16 h-px bg-gradient-to-l from-transparent to-slate-300"></div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <div className="flex flex-col items-center space-y-3 p-6 rounded-2xl bg-white/50 backdrop-blur-sm border border-slate-200 hover:shadow-lg transition-all duration-300">
              <Globe className="w-8 h-8 text-slate-600" />
              <h3 className="text-lg font-medium text-slate-700">Multi-Language</h3>
              <p className="text-sm text-slate-500 font-light text-center">Support for 11+ languages with perfect translation</p>
            </div>
            <div className="flex flex-col items-center space-y-3 p-6 rounded-2xl bg-white/50 backdrop-blur-sm border border-slate-200 hover:shadow-lg transition-all duration-300">
              <Zap className="w-8 h-8 text-slate-600" />
              <h3 className="text-lg font-medium text-slate-700">Perfect Sync</h3>
              <p className="text-sm text-slate-500 font-light text-center">Audio synchronization with original video timing</p>
            </div>
            <div className="flex flex-col items-center space-y-3 p-6 rounded-2xl bg-white/50 backdrop-blur-sm border border-slate-200 hover:shadow-lg transition-all duration-300">
              <Sparkles className="w-8 h-8 text-slate-600" />
              <h3 className="text-lg font-medium text-slate-700">AI Voice</h3>
              <p className="text-sm text-slate-500 font-light text-center">Advanced voice cloning and natural speech</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
