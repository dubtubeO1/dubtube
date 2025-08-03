'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Loader2, CheckCircle, Circle, Home, AlertCircle } from 'lucide-react';

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: number;
  translation?: string;
}

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

export default function VideoPage() {
  const { videoId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const targetLang = searchParams.get('lang') || 'es';
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionSegment[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [dubbedAudioUrl, setDubbedAudioUrl] = useState<string | null>(null);
  
  // Progress tracking
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([
    { id: 'extract', label: 'Extracting audio', status: 'pending' },
    { id: 'transcribe', label: 'Transcribing audio', status: 'pending' },
    { id: 'translate', label: 'Translating text', status: 'pending' },
    { id: 'dub', label: 'Generating dubbed audio', status: 'pending' },
    { id: 'finalize', label: 'Finalizing', status: 'pending' },
  ]);

  // Error handling with redirect timeout
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Helper function to update progress steps
  const updateProgressStep = (stepId: string, status: ProgressStep['status']) => {
    setProgressSteps(prev => 
      prev.map(step => 
        step.id === stepId ? { ...step, status } : step
      )
    );
  };

  // Helper function to get current progress percentage
  const getProgressPercentage = () => {
    const completedSteps = progressSteps.filter(step => step.status === 'completed').length;
    return (completedSteps / progressSteps.length) * 100;
  };

  // Handle error with simple redirect
  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    
    // Clear any existing timeout
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
    }
    
    // Set timeout to redirect after 10 seconds
    redirectTimeoutRef.current = setTimeout(() => {
      router.push('/');
    }, 10000);
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, []);

  // Manual redirect function
  const goHome = () => {
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    router.push('/');
  };

  const translateSegment = async (text: string, targetLang: string) => {
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          targetLang,
        }),
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      const data = await response.json();
      return data.translation;
    } catch (error) {
      console.error('Translation error:', error);
      return null;
    }
  };

  // Helper to post messages to the YouTube iframe
  const postToYouTube = (command: string, value?: any) => {
    if (!iframeRef.current) return;
    iframeRef.current.contentWindow?.postMessage(
      JSON.stringify({
        event: 'command',
        func: command,
        args: value !== undefined ? [value] : [],
      }),
      '*'
    );
  };

  // Sync audio and video
  useEffect(() => {
    if (!audioRef.current || !iframeRef.current) return;
    // Mute video by default
    postToYouTube('mute');
    // Listen for audio play/pause/seek
    const audio = audioRef.current;
    const onPlay = () => postToYouTube('playVideo');
    const onPause = () => postToYouTube('pauseVideo');
    const onSeeked = () => postToYouTube('seekTo', audio.currentTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('seeked', onSeeked);
    // Listen for YouTube events
    const onMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'infoDelivery' && data.info) {
          if (data.info.playerState === 1) audio.play(); // playing
          if (data.info.playerState === 2) audio.pause(); // paused
          if (typeof data.info.currentTime === 'number' && Math.abs(audio.currentTime - data.info.currentTime) > 0.5) {
            audio.currentTime = data.info.currentTime;
          }
        }
      } catch {}
    };
    window.addEventListener('message', onMessage);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('seeked', onSeeked);
      window.removeEventListener('message', onMessage);
    };
  }, [dubbedAudioUrl]);

  useEffect(() => {
    const processVideo = async () => {
      if (!videoId || typeof videoId !== 'string' || videoId.trim() === '') {
        handleError('Invalid video ID');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        // Reset progress steps
        setProgressSteps(prev => 
          prev.map(step => ({ ...step, status: 'pending' }))
        );

        // Step 1: Extract audio
        updateProgressStep('extract', 'active');
        const response = await fetch('/api/extract-audio', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ videoId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          updateProgressStep('extract', 'error');
          handleError(errorData.error || 'Failed to extract audio');
          return;
        }

        const data = await response.json();
        setAudioUrl(data.audioUrl);
        updateProgressStep('extract', 'completed');

        // Step 2: Start transcription
        updateProgressStep('transcribe', 'active');
        setIsTranscribing(true);
        const transcribeResponse = await fetch('/api/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ audioPath: data.audioUrl }),
        });

        if (!transcribeResponse.ok) {
          const errorData = await transcribeResponse.json();
          updateProgressStep('transcribe', 'error');
          handleError(errorData.error || 'Failed to transcribe audio');
          return;
        }

        const transcribeData = await transcribeResponse.json();
        setDetectedLanguage(transcribeData.language);
        updateProgressStep('transcribe', 'completed');

        // Step 3: Start batch translation
        updateProgressStep('translate', 'active');
        setIsTranslating(true);
        const textsToTranslate = transcribeData.transcription.map((segment: TranscriptionSegment) => segment.text);
        const translateResponse = await fetch('/api/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            texts: textsToTranslate,
            targetLang,
          }),
        });
        if (!translateResponse.ok) {
          updateProgressStep('translate', 'error');
          handleError('Translation failed');
          return;
        }
        const translateData = await translateResponse.json();
        const translations = translateData.translations;
        const translatedSegments = transcribeData.transcription.map((segment: TranscriptionSegment, idx: number) => ({
          ...segment,
          translation: translations[idx],
        }));

        setTranscription(translatedSegments);
        updateProgressStep('translate', 'completed');

        // Step 4: Call dubbing API
        updateProgressStep('dub', 'active');
        const dubResponse = await fetch('/api/dub', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transcription: transcribeData.transcription,
            translatedTranscription: translatedSegments,
            audioPath: data.audioUrl,
          }),
        });
        if (dubResponse.ok) {
          const dubData = await dubResponse.json();
          setDubbedAudioUrl(dubData.dubbedAudioUrl);
          updateProgressStep('dub', 'completed');
        } else {
          updateProgressStep('dub', 'error');
          handleError('Failed to generate dubbed audio');
          return;
        }

        // Step 5: Finalize
        updateProgressStep('finalize', 'active');
        // Small delay to show finalization step
        await new Promise(resolve => setTimeout(resolve, 500));
        updateProgressStep('finalize', 'completed');

      } catch (err) {
        console.error('Error in processing:', err);
        handleError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
        setIsTranscribing(false);
        setIsTranslating(false);
      }
    };

    processVideo();
  }, [videoId, targetLang]);

  // Progress Bar Component
  const ProgressBar = () => {
    const percentage = getProgressPercentage();
    
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <div className="w-full max-w-md space-y-6">
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
          
          {/* Progress Percentage */}
          <div className="text-center">
            <span className="text-2xl font-bold text-blue-600">{Math.round(percentage)}%</span>
            <span className="text-gray-500 ml-2">Complete</span>
          </div>
          
          {/* Progress Steps */}
          <div className="space-y-3">
            {progressSteps.map((step, index) => (
              <div key={step.id} className="flex items-center space-x-3">
                {step.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : step.status === 'active' ? (
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                ) : step.status === 'error' ? (
                  <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                    <span className="text-white text-xs">!</span>
                  </div>
                ) : (
                  <Circle className="w-5 h-5 text-gray-400" />
                )}
                <span className={`text-sm ${
                  step.status === 'completed' ? 'text-green-600 font-medium' :
                  step.status === 'active' ? 'text-blue-600 font-medium' :
                  step.status === 'error' ? 'text-red-600 font-medium' :
                  'text-gray-500'
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Error Component
  const ErrorDisplay = () => {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <div className="w-full max-w-md space-y-6 text-center">
          {/* Error Icon */}
          <div className="flex justify-center">
            <AlertCircle className="w-16 h-16 text-red-500" />
          </div>
          
          {/* Error Message */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-800">Oops! An error occurred :(</h2>
            <p className="text-gray-600">Please try again later</p>
          </div>
          
          {/* Redirect Message */}
          <div className="bg-gray-100 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              Redirecting to home page in 10 seconds...
            </p>
          </div>
          
          {/* Manual Action Button */}
          <div className="flex justify-center">
            <button
              onClick={goHome}
              className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Home className="w-5 h-5" />
              <span>Go Home Now</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return <ProgressBar />;
  }

  if (error) {
    return <ErrorDisplay />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="space-y-8">
          {/* Embed YouTube video */}
          <div className="aspect-w-16 aspect-h-9 w-full rounded-lg overflow-hidden shadow-lg">
            <iframe
              ref={iframeRef}
              width="100%"
              height="360"
              src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&mute=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-64 md:h-96"
            ></iframe>
          </div>
          {/* Dubbed audio player */}
          {dubbedAudioUrl ? (
            <audio
              ref={audioRef}
              controls
              className="w-full border-t-2 border-blue-400 mt-4"
              src={dubbedAudioUrl}
            />
          ) : (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="ml-2">Generating dubbed audio...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 