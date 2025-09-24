'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Loader2, CheckCircle, Circle, Home, AlertCircle, Link, Link2Off, Lightbulb } from 'lucide-react';

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
  const [isSyncEnabled, setIsSyncEnabled] = useState(true); // Default to enabled
  const [isPlayerReady, setIsPlayerReady] = useState(false); // Track player readiness
  const [isAudioReady, setIsAudioReady] = useState(false); // Track audio readiness
  
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
  const playerRef = useRef<any>(null); // YouTube player reference

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

  // Initialize YouTube Player API
  useEffect(() => {
    // Load YouTube API script if not already loaded
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Initialize player when API is ready
    const initializePlayer = () => {
      if (!videoId || typeof videoId !== 'string') return;
      
      // Use the existing iframe directly
      if (!iframeRef.current) {
        console.log('Iframe not found, waiting...');
        setTimeout(initializePlayer, 100);
        return;
      }
      
      // Set player as ready immediately since iframe exists
      setIsPlayerReady(true);
      
      console.log('Initializing YouTube player...');
      
      // Create player on the existing iframe
      playerRef.current = new (window as any).YT.Player(iframeRef.current, {
        events: {
          onReady: (event: any) => {
            console.log('YouTube player ready');
            setIsPlayerReady(true);
          },
          onStateChange: (event: any) => {
            if (!isSyncEnabled || !audioRef.current) return;
            
            const audio = audioRef.current;
            const playerState = event.data;
            
            // Sync video state changes to audio
            if (playerState === 1 && audio.paused) { // Playing
              audio.play().catch(console.error);
            } else if (playerState === 2 && !audio.paused) { // Paused
              audio.pause();
            }
          },
          onError: (event: any) => {
            console.error('YouTube player error:', event.data);
          }
        }
      });
    };

    // Check if API is already loaded
    if ((window as any).YT && (window as any).YT.Player) {
      initializePlayer();
    } else {
      (window as any).onYouTubeIframeAPIReady = initializePlayer;
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [videoId]);

  // Simple sync effect - only depends on sync toggle
  useEffect(() => {
    console.log('Sync toggle changed:', isSyncEnabled);
    
    if (!isSyncEnabled) {
      console.log('Sync disabled');
      return;
    }
    
    console.log('Sync enabled - setting up listeners');
    
    // Simple sync logic that doesn't interfere with player
    const audio = audioRef.current;
    const player = playerRef.current;
    
    if (!audio || !player) {
      console.log('Audio or player not ready for sync');
      return;
    }
    
    const syncInterval = setInterval(() => {
      if (isSyncEnabled && audio && player) {
        const timeDiff = Math.abs(audio.currentTime - player.getCurrentTime());
        if (timeDiff > 1) {
          console.log('Syncing audio to video:', audio.currentTime, '->', player.getCurrentTime());
          audio.currentTime = player.getCurrentTime();
        }
      }
    }, 2000);
    
    return () => {
      console.log('Cleaning up sync interval');
      clearInterval(syncInterval);
    };
  }, [isSyncEnabled]);

      // Track audio readiness
    useEffect(() => {
      console.log('Audio readiness effect:', { 
        hasAudio: !!audioRef.current, 
        hasUrl: !!dubbedAudioUrl,
        readyState: audioRef.current?.readyState 
      });
      
      if (!audioRef.current || !dubbedAudioUrl) {
        console.log('Audio not ready - missing ref or URL');
        setIsAudioReady(false);
        return;
      }

      const audio = audioRef.current;
      
      // Set audio as ready immediately if it has a source
      setIsAudioReady(true);
      
      const onCanPlay = () => {
        console.log('Audio can play - ready for sync');
        setIsAudioReady(true);
      };
      
      const onLoadedData = () => {
        console.log('Audio loaded data');
        setIsAudioReady(true);
      };
      
      const onLoadStart = () => {
        console.log('Audio load started');
        setIsAudioReady(false);
    };
    
    const onLoadedMetadata = () => {
      console.log('Audio loaded metadata');
    };
    
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('loadeddata', onLoadedData);
    audio.addEventListener('loadstart', onLoadStart);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    
    // If audio is already loaded, set ready
    if (audio.readyState >= 2) {
      console.log('Audio already loaded, readyState:', audio.readyState);
      setIsAudioReady(true);
    } else {
      console.log('Audio not loaded yet, readyState:', audio.readyState);
    }
    
    return () => {
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('loadeddata', onLoadedData);
      audio.removeEventListener('loadstart', onLoadStart);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [dubbedAudioUrl]);

  // Verify dubbed audio URL is reachable and force metadata load
  useEffect(() => {
    const verifyAndLoad = async () => {
      if (!dubbedAudioUrl || !audioRef.current) return;
      try {
        // HEAD check to make sure file is served correctly
        const res = await fetch(dubbedAudioUrl, { method: 'HEAD' });
        console.log('Dubbed audio HEAD check:', {
          url: dubbedAudioUrl,
          ok: res.ok,
          status: res.status,
          contentLength: res.headers.get('content-length'),
          contentType: res.headers.get('content-type'),
          acceptRanges: res.headers.get('accept-ranges'),
        });
      } catch (e) {
        console.error('Dubbed audio HEAD request failed:', e);
      }

      // Force reload metadata
      try {
        const audio = audioRef.current;
        audio.src = dubbedAudioUrl;
        audio.preload = 'metadata';
        audio.load();
      } catch (e) {
        console.error('Error forcing audio load:', e);
      }
    };

    // Attach error listeners to surface failures
    const audio = audioRef.current;
    const onError = (ev: any) => {
      const target = ev?.target as HTMLAudioElement | undefined;
      console.error('Audio element error:', {
        networkState: target?.networkState,
        readyState: target?.readyState,
        error: target?.error,
        src: target?.currentSrc,
      });
    };
    const onStalled = () => console.warn('Audio stalled');
    const onEmptied = () => console.warn('Audio emptied');

    if (audio) {
      audio.addEventListener('error', onError);
      audio.addEventListener('stalled', onStalled);
      audio.addEventListener('emptied', onEmptied);
    }

    verifyAndLoad();

    return () => {
      if (audio) {
        audio.removeEventListener('error', onError);
        audio.removeEventListener('stalled', onStalled);
        audio.removeEventListener('emptied', onEmptied);
      }
    };
  }, [dubbedAudioUrl]);

  // Manual check for readiness after a delay
  useEffect(() => {
    if (!dubbedAudioUrl) return;
    
    const checkReadiness = () => {
      console.log('Manual readiness check:', {
        audio: !!audioRef.current,
        player: !!playerRef.current,
        playerReady: isPlayerReady,
        audioReady: isAudioReady,
        audioReadyState: audioRef.current?.readyState
      });
      
      // Force check audio ready state
      if (audioRef.current && audioRef.current.readyState >= 2 && !isAudioReady) {
        console.log('Forcing audio ready state');
        setIsAudioReady(true);
      }
    };
    
    // Check after 2 seconds
    const timer = setTimeout(checkReadiness, 2000);
    
    return () => clearTimeout(timer);
  }, [dubbedAudioUrl, isPlayerReady, isAudioReady]);

  // Hide skeletons when sync is ready


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
        
        // Reset audio ready state when new audio is set
        setIsAudioReady(false);

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {/* Floating background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
          <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        </div>

        <div className="relative z-10 w-full max-w-2xl space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-200 dark:via-slate-300 dark:to-slate-400 bg-clip-text text-transparent">
              Processing Video
            </h1>
            <p className="text-slate-600 dark:text-slate-300 font-light text-lg">
              Translating your YouTube video with perfect audio synchronization
            </p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-6">
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-2xl h-4 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-slate-600 to-slate-500 dark:from-slate-400 dark:to-slate-300 h-4 rounded-2xl transition-all duration-700 ease-out shadow-lg"
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
            
            {/* Progress Percentage */}
            <div className="text-center">
              <span className="text-3xl font-bold bg-gradient-to-r from-slate-700 to-slate-500 dark:from-slate-300 dark:to-slate-400 bg-clip-text text-transparent">
                {Math.round(percentage)}%
              </span>
              <span className="text-slate-500 dark:text-slate-400 ml-2 font-light">Complete</span>
            </div>
          </div>
          
          {/* Progress Steps */}
          <div className="space-y-4">
            {progressSteps.map((step, index) => (
              <div key={step.id} className="flex items-center space-x-4 p-4 rounded-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 transition-all duration-300">
                {step.status === 'completed' ? (
                  <CheckCircle className="w-6 h-6 text-green-500" />
                ) : step.status === 'active' ? (
                  <Loader2 className="w-6 h-6 text-slate-600 dark:text-slate-300 animate-spin" />
                ) : step.status === 'error' ? (
                  <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">!</span>
                  </div>
                ) : (
                  <Circle className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                )}
                <span className={`text-lg font-medium ${
                  step.status === 'completed' ? 'text-green-600 dark:text-green-400' :
                  step.status === 'active' ? 'text-slate-700 dark:text-slate-200' :
                  step.status === 'error' ? 'text-red-600 dark:text-red-400' :
                  'text-slate-500 dark:text-slate-400'
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
    // Determine specific error message based on error type
    const getErrorMessage = () => {
      if (error?.includes('format is not available')) {
        return {
          title: 'Video Format Not Available',
          message: 'This video may have restrictions or be unavailable in the required format. Please try a different video.',
          suggestion: 'Try a shorter video or one that\'s publicly available'
        };
      } else if (error?.includes('403') || error?.includes('Forbidden')) {
        return {
          title: 'Access Denied',
          message: 'YouTube is blocking access to this video. This might be due to geo-restrictions or age restrictions.',
          suggestion: 'Try a different video that\'s publicly accessible'
        };
      } else if (error?.includes('fragment') || error?.includes('not found')) {
        return {
          title: 'Video Download Failed',
          message: 'Unable to download video segments. This could be due to network issues or video availability.',
          suggestion: 'Check your internet connection and try again'
        };
      } else if (error?.includes('Failed to extract audio')) {
        return {
          title: 'Audio Extraction Failed',
          message: 'Could not extract audio from the video. The video might be corrupted or in an unsupported format.',
          suggestion: 'Try a different video with clear audio'
        };
      } else {
        return {
          title: 'Processing Error',
          message: 'An unexpected error occurred while processing your video.',
          suggestion: 'Please try again with a different video'
        };
      }
    };

    const errorInfo = getErrorMessage();

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {/* Floating background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
          <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        </div>

        <div className="relative z-10 w-full max-w-lg space-y-8 text-center">
          {/* Error Icon */}
          <div className="flex justify-center">
            <AlertCircle className="w-20 h-20 text-red-500" />
          </div>
          
          {/* Error Message */}
          <div className="space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-slate-700 to-slate-500 dark:from-slate-300 dark:to-slate-400 bg-clip-text text-transparent">
              {errorInfo.title}
            </h2>
            <p className="text-slate-600 dark:text-slate-300 font-light text-lg">
              {errorInfo.message}
            </p>
          </div>
          
          {/* Suggestion */}
          <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center space-x-3 mb-3">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              <span className="font-medium text-slate-700 dark:text-slate-200">Suggestion</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 font-light">
              {errorInfo.suggestion}
            </p>
          </div>
          
          {/* Redirect Message */}
          <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
            <p className="text-slate-600 dark:text-slate-300 font-light">
              Redirecting to home page in 10 seconds...
            </p>
          </div>
          
          {/* Manual Action Button */}
          <div className="flex justify-center">
            <button
              onClick={goHome}
              className="flex items-center justify-center space-x-3 bg-gradient-to-r from-slate-700 to-slate-600 dark:from-slate-600 dark:to-slate-500 text-white px-8 py-4 rounded-2xl hover:from-slate-800 hover:to-slate-700 dark:hover:from-slate-500 dark:hover:to-slate-400 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              <Home className="w-5 h-5" />
              <span className="font-medium">Go Home Now</span>
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





  console.log('Rendering video page:', { 
    videoId, 
    isSyncEnabled, 
    hasAudio: !!audioRef.current, 
    hasPlayer: !!playerRef.current,
    hasDubbedAudio: !!dubbedAudioUrl 
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 relative overflow-hidden">
      {/* Floating background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="space-y-8">


            {/* Embed YouTube video */}
            <div className="w-full rounded-2xl overflow-hidden shadow-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
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
                onLoad={() => console.log('YouTube iframe loaded')}
              ></iframe>
            </div>
            
            {/* Dubbed audio player */}
            {dubbedAudioUrl ? (
              <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-slate-700 dark:text-slate-200">Translated Audio</h3>
                  
                  {/* iOS Style Sync Toggle */}
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Sync</span>
                    <button
                      onClick={() => {
                        console.log('Toggle clicked, current state:', isSyncEnabled);
                        setIsSyncEnabled(!isSyncEnabled);
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 cursor-pointer ${
                        isSyncEnabled
                          ? 'bg-gradient-to-r from-green-500 to-green-600 shadow-lg shadow-green-500/50'
                          : 'bg-slate-300 hover:bg-slate-400'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300 ${
                          isSyncEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <audio
                  ref={audioRef}
                  controls
                  className="w-full"
                  src={dubbedAudioUrl || undefined}
                  preload="metadata"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center p-8 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center space-x-3 text-slate-600 dark:text-slate-300">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="font-light">Generating dubbed audio...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 