'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const processVideo = async () => {
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

        // Start translation
        setIsTranslating(true);
        const translatedSegments = await Promise.all(
          transcribeData.transcription.map(async (segment: TranscriptionSegment) => {
            const translation = await translateSegment(segment.text, targetLang);
            return {
              ...segment,
              translation,
            };
          })
        );

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
        {audioUrl && (
          <div className="space-y-4">
            <audio
              controls
              className="w-full"
              src={audioUrl}
            />
            {dubbedAudioUrl && (
              <audio
                controls
                className="w-full border-t-2 border-blue-400 mt-4"
                src={dubbedAudioUrl}
              />
            )}
            
            {(isTranscribing || isTranslating) ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">
                  {isTranscribing ? 'Transcribing audio...' : 'Translating...'}
                </span>
              </div>
            ) : transcription.length > 0 ? (
              <>
                {/* Original Transcription Box */}
                <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-semibold">Transcription</h2>
                    {detectedLanguage && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Detected language: {detectedLanguage}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {transcription.map((segment, index) => (
                      <div key={index} className="mb-4">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                          <span>{formatTime(segment.start)} - {formatTime(segment.end)}</span>
                          {segment.speaker && (
                            <span className="px-2 py-0.5 bg-gray-100 rounded-full">
                              Speaker {segment.speaker}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-800 dark:text-gray-200 mb-2">{segment.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Translated Transcription Box */}
                <div className="p-4 bg-blue-50 dark:bg-blue-900 rounded-lg mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-semibold">Translated Transcription</h2>
                    <span className="text-sm text-blue-600 dark:text-blue-300">
                      Target language: {targetLang.toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {transcription.map((segment, index) => (
                      <div key={index} className="mb-4">
                        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-300 mb-1">
                          <span>{formatTime(segment.start)} - {formatTime(segment.end)}</span>
                          {segment.speaker && (
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800 rounded-full">
                              Speaker {segment.speaker}
                            </span>
                          )}
                        </div>
                        <p className="text-blue-900 dark:text-blue-100 italic">{segment.translation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-center">
                No transcription available
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
} 