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
        '--retries', '3', // Reduced retries
        '--fragment-retries', '3', // Reduced fragment retries
        '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', // Mobile Safari user agent
        '--referer', 'https://www.youtube.com/', // Add referer header
        '--add-header', 'Accept-Language:en-US,en;q=0.9', // Add language header
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', // Add accept header
        '--sleep-interval', '1', // Shorter delay
        '--max-sleep-interval', '3', // Shorter random sleep
        '--sleep-requests', '1', // Sleep after each request
        '--extractor-args', 'youtube:player_client=ios', // Use only iOS client
        '--extractor-args', 'youtube:skip=dash,hls', // Skip problematic formats
        '--extractor-args', 'youtube:include_live_chat=false', // Skip live chat
        '--no-cookies', // Don't use cookies
        '--geo-bypass', // Bypass geo-restrictions
        '--geo-bypass-country', 'US' // Use US as bypass country
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
            .catch((altError) => {
              console.log('Alternative format failed, trying third fallback...');
              tryThirdFallback(youtubeUrl, outputPath, ffmpegDir)
                .then(resolve)
                .catch(reject);
            });
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
      '--retries', '3', // Reduced retries
      '--fragment-retries', '3',
      '--user-agent', 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36', // Android Chrome user agent
      '--referer', 'https://www.youtube.com/',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '--sleep-interval', '2', // Shorter delay
      '--max-sleep-interval', '4',
      '--sleep-requests', '2',
      '--extractor-args', 'youtube:player_client=android', // Use Android client
      '--extractor-args', 'youtube:skip=dash,hls,webm', // Skip more problematic formats
      '--extractor-args', 'youtube:include_live_chat=false',
      '--no-cookies', // Don't use cookies for fallback
      '--geo-bypass',
      '--geo-bypass-country', 'US'
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

// Third fallback extraction function - most aggressive approach
async function tryThirdFallback(youtubeUrl: string, outputPath: string, ffmpegDir: string): Promise<NextResponse> {
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
      '--retries', '3', // Reduced retries
      '--fragment-retries', '3',
      '--user-agent', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', // Use Googlebot user agent
      '--referer', 'https://www.google.com/',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '--sleep-interval', '3', // Shorter delay
      '--max-sleep-interval', '6',
      '--sleep-requests', '3',
      '--extractor-args', 'youtube:player_client=web', // Use basic web client
      '--extractor-args', 'youtube:skip=dash,hls,webm,mp4', // Skip most formats
      '--extractor-args', 'youtube:include_live_chat=false',
      '--no-cookies',
      '--geo-bypass',
      '--geo-bypass-country', 'US'
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
      console.log('yt-dlp third fallback output:', chunk);
    });

    ytDlp.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.log('yt-dlp third fallback error:', chunk);
    });

    ytDlp.on('close', (code) => {
      console.log('yt-dlp third fallback process exited with code', code);
      
      if (code === 0) {
        const relativePath = `/audio/${path.basename(outputPath)}`;
        resolve(NextResponse.json({ audioUrl: relativePath }));
      } else {
        reject(NextResponse.json({ 
          error: 'Failed to extract audio with all available methods. YouTube may be blocking automated requests.',
          details: errorOutput,
          suggestion: 'Try using a different video or check if the video is publicly available.'
        }, { status: 500 }));
      }
    });

    ytDlp.on('error', (error) => {
      console.error('yt-dlp third fallback process error:', error);
      reject(NextResponse.json({ 
        error: 'Failed to start third fallback audio extraction process',
        details: error.message
      }, { status: 500 }));
    });
  });
} 