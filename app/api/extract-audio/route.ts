import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    const { videoId } = await request.json();
    
    if (!videoId) {
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    console.log('Received request for video ID:', videoId);

    // Generate a unique filename
    const filename = `${uuidv4()}.mp3`;
    const outputPath = path.join(process.cwd(), 'public', 'audio', filename);
    
    console.log('Output path:', outputPath);

    // Ensure the audio directory exists
    await mkdir(path.join(process.cwd(), 'public', 'audio'), { recursive: true });
    console.log('Ensured audio directory exists');

    // Construct the YouTube URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log('YouTube URL:', youtubeUrl);

    // Get the ffmpeg directory path
    const ffmpegDir = '/opt/homebrew/bin';
    console.log('Using ffmpeg directory:', ffmpegDir);

    return new Promise((resolve, reject) => {
      const ytDlp = spawn('yt-dlp', [
        youtubeUrl,
        '-x', // Extract audio
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', outputPath,
        '--ffmpeg-location', ffmpegDir,
        '--no-playlist',
        '--no-warnings',
        '--quiet',
        '--verbose', // Add verbose logging for debugging
        '--no-check-certificate', // Skip certificate validation
        '--prefer-ffmpeg' // Prefer ffmpeg over other tools
      ]);

      let output = '';
      let errorOutput = '';

      ytDlp.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        console.log('yt-dlp output:', chunk);
      });

      ytDlp.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        console.log('yt-dlp error:', chunk);
      });

      ytDlp.on('close', (code) => {
        console.log('yt-dlp process exited with code', code);
        
        if (code === 0) {
          // Return the relative path to the audio file
          const relativePath = `/audio/${filename}`;
          resolve(NextResponse.json({ audioUrl: relativePath }));
        } else {
          reject(NextResponse.json({ 
            error: 'Failed to extract audio',
            details: errorOutput
          }, { status: 500 }));
        }
      });

      ytDlp.on('error', (error) => {
        console.error('yt-dlp process error:', error);
        reject(NextResponse.json({ 
          error: 'Failed to start audio extraction process',
          details: error.message
        }, { status: 500 }));
      });
    });
  } catch (error) {
    console.error('Error in extract-audio:', error);
    return NextResponse.json({ 
      error: 'Failed to process audio extraction',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 