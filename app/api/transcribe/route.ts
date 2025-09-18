import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

interface LemonFoxResponse {
  segments: TranscriptionSegment[];
  language: string;
}

export async function POST(request: Request) {
  try {
    const { audioPath } = await request.json();
    
    if (!audioPath) {
      return NextResponse.json({ error: 'Audio path is required' }, { status: 400 });
    }

    console.log('Processing audio file:', audioPath);

    // Read the audio file
    const fullPath = path.join(process.cwd(), 'public', audioPath);
    console.log('Full path:', fullPath);
    
    const audioFile = await readFile(fullPath);
    console.log('Audio file size:', audioFile.length, 'bytes');

    // Get audio duration using ffprobe - use system PATH in production
    const ffprobePath = process.env.NODE_ENV === 'production' ? 'ffprobe' : '/opt/homebrew/bin/ffprobe';
    const { stdout: durationOutput } = await execAsync(
      `${ffprobePath} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${fullPath}"`
    );
    const duration = parseFloat(durationOutput.trim());
    console.log('Audio duration:', duration, 'seconds');

    // Create form data for the API request
    const formData = new FormData();
    formData.append('file', new Blob([audioFile]));
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    formData.append('speaker_labels', 'true');
    // Let the API auto-detect the language
    // formData.append('language', 'auto');

    console.log('Sending request to LemonFox API...');

    // Call LemonFox API
    const response = await fetch('https://api.lemonfox.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LEMONFOX_API_KEY}`,
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('LemonFox API error:', errorData);
      throw new Error(errorData.error || 'Failed to transcribe audio');
    }

    const data = await response.json() as LemonFoxResponse;
    console.log('Received transcription data');
    console.log('Detected language:', data.language);
    
    if (!data.segments || !Array.isArray(data.segments)) {
      console.error('No segments in response:', data);
      throw new Error('Invalid response from transcription service');
    }

    // Convert segments to our format
    const transcription = data.segments.map((segment: TranscriptionSegment) => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
      speaker: segment.speaker || 'Unknown'
    }));

    return NextResponse.json({ 
      transcription,
      language: data.language 
    });

  } catch (error) {
    console.error('Error in transcribe:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to transcribe audio' },
      { status: 500 }
    );
  }
}

function parseSRT(srtContent: string): Array<{ start: number; end: number; text: string }> {
  if (!srtContent || typeof srtContent !== 'string') {
    console.error('Invalid SRT content:', srtContent);
    throw new Error('Invalid SRT content');
  }

  const segments: Array<{ start: number; end: number; text: string }> = [];
  
  // Split the SRT content into blocks
  const blocks = srtContent.trim().split('\n\n');
  console.log('Found', blocks.length, 'blocks in SRT');
  
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) {
      console.warn('Skipping invalid block:', block);
      continue; // Skip invalid blocks
    }
    
    try {
      // Parse timestamp line (format: "00:00:00,000 --> 00:00:00,000")
      const timestampLine = lines[1];
      const [startTime, endTime] = timestampLine.split(' --> ').map(time => {
        const [hours, minutes, seconds] = time.split(':');
        return parseFloat(hours) * 3600 + parseFloat(minutes) * 60 + parseFloat(seconds.replace(',', '.'));
      });
      
      // Get the text content (all lines after the timestamp)
      const text = lines.slice(2).join(' ').trim();
      
      segments.push({
        start: startTime,
        end: endTime,
        text
      });
    } catch (error) {
      console.error('Error parsing block:', block, error);
      continue; // Skip this block if there's an error
    }
  }
  
  return segments;
} 