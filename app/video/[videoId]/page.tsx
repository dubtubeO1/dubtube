'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: number;
  translation?: string;
}

export default function VideoPage() {
  const { videoId } = useParams();
  const searchParams = useSearchParams();
  const targetLang = searchParams.get('lang') || 'es';
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionSegment[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [dubbedAudioUrl, setDubbedAudioUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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
        setError('Invalid video ID');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Extract audio
        const response = await fetch('/api/extract-audio', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ videoId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to extract audio');
        }

        const data = await response.json();
        setAudioUrl(data.audioUrl);

        // Start transcription
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
          throw new Error(errorData.error || 'Failed to transcribe audio');
        }

        const transcribeData = await transcribeResponse.json();
        setDetectedLanguage(transcribeData.language);

        // Start batch translation
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
          throw new Error('Batch translation failed');
        }
        const translateData = await translateResponse.json();
        const translations = translateData.translations;
        const translatedSegments = transcribeData.transcription.map((segment: TranscriptionSegment, idx: number) => ({
          ...segment,
          translation: translations[idx],
        }));

        setTranscription(translatedSegments);

        // Call dubbing API
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
        } else {
          setDubbedAudioUrl(null);
        }
      } catch (err) {
        console.error('Error in processing:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
        setIsTranscribing(false);
        setIsTranslating(false);
      }
    };

    processVideo();
  }, [videoId, targetLang]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Extracting audio...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500">
        Error: {error}
      </div>
    );
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