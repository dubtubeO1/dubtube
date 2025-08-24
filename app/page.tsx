'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { extractYouTubeId, isValidYouTubeUrl } from './utils/youtube';
import { Globe, Play, Sparkles, Zap, CheckCircle } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('es');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedText, setTypedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValidYouTubeUrl(url)) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    const videoId = extractYouTubeId(url);
    if (!videoId) {
      setError('Could not extract video ID from URL');
      return;
    }

    setIsLoading(true);
    try {
      router.push(`/video/${videoId}?lang=${language}`);
    } catch (err) {
      setError('Failed to process video');
      console.error(err);
    } finally {
      setIsLoading(false);
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

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
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
                    <span>Processing...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center space-x-3">
                    <Play className="w-5 h-5" />
                    <span>Translate Video</span>
                  </span>
                )}
              </button>
            </form>

            {/* Usage info */}
            <div className="space-y-4 mt-6">
              <div className="flex items-center justify-center space-x-4 text-sm text-slate-500">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Free tier: 1 video/day (max 5 min)</span>
                </div>
                <div className="w-px h-4 bg-slate-300"></div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Sign up for unlimited access</span>
                </div>
              </div>
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
