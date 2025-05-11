'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: number;
}

export default function VideoPage() {
  const { videoId } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionSegment[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);

  useEffect(() => {
    const extractAudio = async () => {
      try {
        setIsLoading(true);
        setError(null);
        console.log('Starting audio extraction for video:', videoId);

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
        console.log('Audio extraction successful:', data);
        setAudioUrl(data.audioUrl);

        // Start transcription
        setIsTranscribing(true);
        console.log('Starting transcription for audio:', data.audioUrl);
        
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
        console.log('Transcription received:', transcribeData);

        if (!Array.isArray(transcribeData.transcription)) {
          console.error('Invalid transcription data:', transcribeData);
          throw new Error('Invalid transcription data format');
        }

        setTranscription(transcribeData.transcription);
        setDetectedLanguage(transcribeData.language);
      } catch (err) {
        console.error('Error in audio processing:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
        setIsTranscribing(false);
      }
    };

    extractAudio();
  }, [videoId]);

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
            
            {isTranscribing ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">Transcribing audio...</span>
              </div>
            ) : transcription.length > 0 ? (
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
                      <p className="text-gray-800">{segment.text}</p>
                    </div>
                  ))}
                </div>
              </div>
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