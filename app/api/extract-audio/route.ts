import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request): Promise<NextResponse> {
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

    // Get the ffmpeg directory path - use system PATH in production
    const ffmpegDir = process.env.NODE_ENV === 'production' ? '' : '/opt/homebrew/bin';
    console.log('Using ffmpeg directory:', ffmpegDir || 'system PATH');

    return new Promise<NextResponse>((resolve, reject) => {
      const args = [
        youtubeUrl,
        '-x', // Extract audio
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', outputPath,
        '--no-playlist',
        '--no-warnings',
        '--quiet',
        '--verbose', // Add verbose logging for debugging
        '--no-check-certificate', // Skip certificate validation
        '--prefer-ffmpeg', // Prefer ffmpeg over other tools
        '--extract-audio', // Ensure audio extraction
        '--format', 'bestaudio[ext=m4a]/bestaudio/best', // Fallback format selection
        '--retries', '3', // Retry failed downloads
        '--fragment-retries', '3', // Retry failed fragments
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', // Updated user agent
        '--referer', 'https://www.youtube.com/', // Add referer header
        '--add-header', 'Accept-Language:en-US,en;q=0.9', // Add language header
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8', // Add accept header
        '--sleep-interval', '1', // Add delay between requests
        '--max-sleep-interval', '3', // Random sleep between 1-3 seconds
        '--sleep-requests', '1', // Sleep after each request
        '--extractor-args', 'youtube:player_client=android,web' // Use mobile client to avoid bot detection
      ];

      // Only add ffmpeg-location if we have a specific path
      if (ffmpegDir) {
        args.splice(6, 0, '--ffmpeg-location', ffmpegDir);
      }

      const ytDlp = spawn('yt-dlp', args);

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
          // Try alternative approach with different format
          console.log('First attempt failed, trying alternative format...');
          tryAlternativeFormat(youtubeUrl, outputPath, ffmpegDir)
            .then(resolve)
            .catch(reject);
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

// Alternative format extraction function
async function tryAlternativeFormat(youtubeUrl: string, outputPath: string, ffmpegDir: string): Promise<NextResponse> {
  return new Promise<NextResponse>((resolve, reject) => {
    const args = [
      youtubeUrl,
      '-x', // Extract audio
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outputPath,
      '--no-playlist',
      '--no-warnings',
      '--quiet',
      '--format', 'worstaudio/worst', // Try worst quality as fallback
      '--retries', '5', // More retries
      '--fragment-retries', '5',
      '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', // Use mobile Safari user agent
      '--referer', 'https://www.youtube.com/',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '--sleep-interval', '2', // Longer delay for fallback
      '--max-sleep-interval', '5',
      '--sleep-requests', '2',
      '--extractor-args', 'youtube:player_client=ios,android' // Use mobile clients
    ];

    // Only add ffmpeg-location if we have a specific path
    if (ffmpegDir) {
      args.splice(6, 0, '--ffmpeg-location', ffmpegDir);
    }

    const ytDlp = spawn('yt-dlp', args);

    let output = '';
    let errorOutput = '';

    ytDlp.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log('yt-dlp alternative output:', chunk);
    });

    ytDlp.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.log('yt-dlp alternative error:', chunk);
    });

    ytDlp.on('close', (code) => {
      console.log('yt-dlp alternative process exited with code', code);
      
      if (code === 0) {
        const relativePath = `/audio/${path.basename(outputPath)}`;
        resolve(NextResponse.json({ audioUrl: relativePath }));
      } else {
        reject(NextResponse.json({ 
          error: 'Failed to extract audio with all available formats',
          details: errorOutput
        }, { status: 500 }));
      }
    });

    ytDlp.on('error', (error) => {
      console.error('yt-dlp alternative process error:', error);
      reject(NextResponse.json({ 
        error: 'Failed to start alternative audio extraction process',
        details: error.message
      }, { status: 500 }));
    });
  });
} 