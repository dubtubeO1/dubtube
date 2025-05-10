'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function VideoPage() {
  const params = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    const extractAudio = async () => {
      try {
        setIsLoading(true);
        console.log('Sending request to extract audio for video ID:', params.videoId);
        
        const response = await fetch('/api/extract-audio', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ videoId: params.videoId }),
        });

        console.log('Received response:', response.status);
        const data = await response.json();
        console.log('Response data:', data);

        if (!response.ok) {
          throw new Error(data.error || 'Failed to extract audio');
        }

        setAudioUrl(data.audioUrl);
        console.log('Set audio URL:', data.audioUrl);
      } catch (err) {
        console.error('Error in extractAudio:', err);
        setError(err instanceof Error ? err.message : 'Failed to process video');
      } finally {
        setIsLoading(false);
      }
    };

    extractAudio();
  }, [params.videoId]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Extracting audio...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        {audioUrl && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Extracted Audio
            </h2>
            <audio
              controls
              className="w-full"
              src={audioUrl}
            >
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
      </div>
    </div>
  );
} 