import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { videoId, browserFingerprint, clientIP } = await request.json();
    
    if (!videoId) {
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    // Get real client IP from request headers
    const realClientIP = request.headers.get('x-forwarded-for') || 
                        request.headers.get('x-real-ip') || 
                        request.headers.get('cf-connecting-ip') ||
                        clientIP || 
                        'unknown';
    
    console.log('Received request for video ID:', videoId);
    console.log('Browser fingerprint available:', !!browserFingerprint);
    console.log('Client IP from headers:', realClientIP);

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
      // Use real browser fingerprint if available, otherwise fallback to our bypass
      const useRealFingerprint = browserFingerprint && browserFingerprint.userAgent;
      
      let args;
      
      if (useRealFingerprint) {
        console.log('Using real browser fingerprint for extraction');
        args = [
          youtubeUrl,
          '-x', '--audio-format', 'mp3', '--audio-quality', '0',
          '-o', outputPath,
          '--no-playlist', '--no-warnings', '--quiet', '--verbose',
          '--no-check-certificate', '--prefer-ffmpeg', '--extract-audio',
          '--format', 'bestaudio[height<=720]/bestaudio',
          '--retries', '3', '--fragment-retries', '3',
          '--user-agent', browserFingerprint.userAgent, // Real user's browser
          '--referer', 'https://www.youtube.com/', // YouTube referer for real users
          '--add-header', `Accept-Language:${browserFingerprint.language}`, // Real user's language
          '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          '--add-header', 'Accept-Encoding:gzip, deflate, br',
          '--add-header', 'Accept-Charset:UTF-8,*;q=0.7',
          '--add-header', 'Cache-Control:no-cache',
          '--add-header', 'Pragma:no-cache',
          '--add-header', `X-Forwarded-For:${realClientIP}`, // Real user's IP
          '--add-header', `X-Real-IP:${realClientIP}`, // Real user's IP
          '--add-header', `X-Client-IP:${realClientIP}`, // Real user's IP
          '--add-header', `Screen-Resolution:${browserFingerprint.screenResolution}`,
          '--add-header', `Timezone:${browserFingerprint.timezone}`,
          '--add-header', `Platform:${browserFingerprint.platform}`,
          '--add-header', `Color-Depth:${browserFingerprint.colorDepth}`,
          '--add-header', `Pixel-Ratio:${browserFingerprint.pixelRatio}`,
          '--add-header', `Hardware-Concurrency:${browserFingerprint.hardwareConcurrency}`,
          '--add-header', `Max-Touch-Points:${browserFingerprint.maxTouchPoints}`,
          '--add-header', `Cookie-Enabled:${browserFingerprint.cookieEnabled}`,
          '--add-header', `Do-Not-Track:${browserFingerprint.doNotTrack}`,
          '--sleep-interval', '2', '--max-sleep-interval', '5', '--sleep-requests', '2',
          '--extractor-args', 'youtube:player_client=ios,android,web', // Use multiple clients for real users
          '--extractor-args', 'youtube:skip=dash,hls', // Skip problematic formats
          '--extractor-args', 'youtube:include_live_chat=false',
          '--extractor-args', 'youtube:formats=missing_pot',
          '--geo-bypass', '--geo-bypass-country', 'US',
          '--check-formats'
        ];
      } else {
        console.log('Using fallback bypass method');
        args = [
          youtubeUrl,
          '-x', '--audio-format', 'mp3', '--audio-quality', '0',
          '-o', outputPath,
          '--no-playlist', '--no-warnings', '--quiet', '--verbose',
          '--no-check-certificate', '--prefer-ffmpeg', '--extract-audio',
          '--format', 'bestaudio[height<=720]/bestaudio',
          '--retries', '3', '--fragment-retries', '3',
          '--user-agent', 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
          '--referer', 'https://www.google.com/',
          '--add-header', 'Accept-Language:en-US,en;q=0.9',
          '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          '--add-header', 'X-Forwarded-For:192.168.1.100',
          '--add-header', 'X-Real-IP:192.168.1.100',
          '--sleep-interval', '1', '--max-sleep-interval', '3', '--sleep-requests', '1',
          '--extractor-args', 'youtube:player_client=android',
          '--extractor-args', 'youtube:skip=dash,hls,webm,mp4',
          '--extractor-args', 'youtube:include_live_chat=false',
          '--extractor-args', 'youtube:formats=missing_pot',
          '--geo-bypass', '--geo-bypass-country', 'US',
          '--check-formats'
        ];
      }

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
          tryAlternativeFormat(youtubeUrl, outputPath, ffmpegDir, browserFingerprint)
            .then(resolve)
            .catch((altError) => {
              console.log('Alternative format failed, trying third fallback...');
              tryThirdFallback(youtubeUrl, outputPath, ffmpegDir, browserFingerprint)
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
async function tryAlternativeFormat(youtubeUrl: string, outputPath: string, ffmpegDir: string, browserFingerprint?: any): Promise<NextResponse> {
  return new Promise<NextResponse>((resolve, reject) => {
    // Use browser fingerprint if available, otherwise use fallback
    const useRealFingerprint = browserFingerprint && browserFingerprint.userAgent;
    
    let args;
    
    if (useRealFingerprint) {
      console.log('Using real browser fingerprint for alternative format');
      args = [
        youtubeUrl,
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        '-o', outputPath,
        '--no-playlist', '--no-warnings', '--quiet',
        '--format', 'bestaudio/best',
        '--retries', '2', '--fragment-retries', '2',
        '--user-agent', browserFingerprint.userAgent,
        '--referer', 'https://www.youtube.com/',
        '--add-header', `Accept-Language:${browserFingerprint.language}`,
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--add-header', `Screen-Resolution:${browserFingerprint.screenResolution}`,
        '--add-header', `Platform:${browserFingerprint.platform}`,
        '--sleep-interval', '2', '--max-sleep-interval', '4', '--sleep-requests', '2',
        '--extractor-args', 'youtube:player_client=android',
        '--extractor-args', 'youtube:skip=dash,hls,webm,mp4',
        '--extractor-args', 'youtube:include_live_chat=false',
        '--extractor-args', 'youtube:formats=missing_pot',
        '--no-cookies', '--geo-bypass', '--geo-bypass-country', 'US',
        '--check-formats'
      ];
    } else {
      console.log('Using fallback bypass for alternative format');
      args = [
        youtubeUrl,
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        '-o', outputPath,
        '--no-playlist', '--no-warnings', '--quiet',
        '--format', 'bestaudio/best',
        '--retries', '2', '--fragment-retries', '2',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--referer', 'https://www.google.com/',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--add-header', 'X-Forwarded-For:192.168.1.200',
        '--add-header', 'X-Real-IP:192.168.1.200',
        '--sleep-interval', '2', '--max-sleep-interval', '4', '--sleep-requests', '2',
        '--extractor-args', 'youtube:player_client=web',
        '--extractor-args', 'youtube:skip=dash,hls,webm,mp4',
        '--extractor-args', 'youtube:include_live_chat=false',
        '--extractor-args', 'youtube:formats=missing_pot',
        '--no-cookies', '--geo-bypass', '--geo-bypass-country', 'US',
        '--check-formats'
      ];
    }

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
async function tryThirdFallback(youtubeUrl: string, outputPath: string, ffmpegDir: string, browserFingerprint?: any): Promise<NextResponse> {
  return new Promise<NextResponse>((resolve, reject) => {
    // Use browser fingerprint if available, otherwise use fallback
    const useRealFingerprint = browserFingerprint && browserFingerprint.userAgent;
    
    let args;
    
    if (useRealFingerprint) {
      console.log('Using real browser fingerprint for third fallback');
      args = [
        youtubeUrl,
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        '-o', outputPath,
        '--no-playlist', '--no-warnings', '--quiet',
        '--format', 'bestaudio/best',
        '--retries', '2', '--fragment-retries', '2',
        '--user-agent', browserFingerprint.userAgent,
        '--referer', 'https://www.youtube.com/',
        '--add-header', `Accept-Language:${browserFingerprint.language}`,
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--add-header', `Screen-Resolution:${browserFingerprint.screenResolution}`,
        '--add-header', `Platform:${browserFingerprint.platform}`,
        '--sleep-interval', '3', '--max-sleep-interval', '6', '--sleep-requests', '3',
        '--extractor-args', 'youtube:player_client=tv_embedded',
        '--extractor-args', 'youtube:skip=dash,hls,webm,mp4',
        '--extractor-args', 'youtube:include_live_chat=false',
        '--extractor-args', 'youtube:formats=missing_pot',
        '--no-cookies', '--geo-bypass', '--geo-bypass-country', 'US',
        '--check-formats'
      ];
    } else {
      console.log('Using fallback bypass for third fallback');
      args = [
        youtubeUrl,
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        '-o', outputPath,
        '--no-playlist', '--no-warnings', '--quiet',
        '--format', 'bestaudio/best',
        '--retries', '2', '--fragment-retries', '2',
        '--user-agent', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        '--referer', 'https://www.google.com/',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--add-header', 'X-Forwarded-For:192.168.1.300',
        '--add-header', 'X-Real-IP:192.168.1.300',
        '--sleep-interval', '3', '--max-sleep-interval', '6', '--sleep-requests', '3',
        '--extractor-args', 'youtube:player_client=tv_embedded',
        '--extractor-args', 'youtube:skip=dash,hls,webm,mp4',
        '--extractor-args', 'youtube:include_live_chat=false',
        '--extractor-args', 'youtube:formats=missing_pot',
        '--no-cookies', '--geo-bypass', '--geo-bypass-country', 'US',
        '--check-formats'
      ];
    }

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