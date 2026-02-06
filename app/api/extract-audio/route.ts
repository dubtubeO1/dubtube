import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ytDlpQueue } from '@/lib/extract-audio-queue';
import { getRandomProxyUrl } from '@/lib/proxy';

/** Stream status events (NDJSON). */
type StreamStatus = { status: 'queued' } | { status: 'processing' } | { status: 'done'; audioUrl: string } | { status: 'error'; error: string };

/**
 * Run the first yt-dlp attempt (and fallbacks). Returns NextResponse on success or throws NextResponse on error.
 * Used inside the concurrency gate so only this part is limited.
 *
 * proxyUrl is chosen once per job and reused for all fallbacks.
 */
function runExtraction(
  youtubeUrl: string,
  outputPath: string,
  filename: string,
  ffmpegDir: string,
  browserFingerprint: unknown,
  realClientIP: string,
  proxyUrl: string | null
): Promise<NextResponse> {
  return new Promise<NextResponse>((resolve, reject) => {
    const useRealFingerprint = browserFingerprint && typeof browserFingerprint === 'object' && (browserFingerprint as { userAgent?: string }).userAgent;
    let args: string[];

    if (useRealFingerprint) {
      const fp = browserFingerprint as { userAgent: string; language?: string };
      console.log('Using real browser fingerprint for extraction');
      const baseArgs: string[] = [
        youtubeUrl,
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        ...(ffmpegDir ? ['--ffmpeg-location', ffmpegDir] : []),
        '-o', outputPath,
        '--no-playlist', '--no-warnings', '--quiet', '--verbose',
        '--no-check-certificate', '--prefer-ffmpeg', '--extract-audio',
        '--format', 'bestaudio[height<=720]/bestaudio',
        '--retries', '3', '--fragment-retries', '3',
        '--user-agent', fp.userAgent,
        '--referer', 'https://www.youtube.com/',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--add-header', `Accept-Language:${fp.language || 'en-US,en;q=0.9'}`,
        '--add-header', 'Accept-Encoding:gzip, deflate, br',
        '--add-header', 'Cache-Control:no-cache',
        '--add-header', 'Pragma:no-cache',
        '--sleep-interval', '2', '--max-sleep-interval', '5', '--sleep-requests', '2',
        '--extractor-args', 'youtube:player_client=ios',
        '--extractor-args', 'youtube:skip=dash,hls',
        '--extractor-args', 'youtube:skip=hls',
        '--extractor-args', 'youtube:include_live_chat=false',
        '--extractor-args', 'youtube:formats=missing_pot',
        '--geo-bypass', '--geo-bypass-country', 'US',
        '--check-formats',
      ];
      args = proxyUrl ? ['--proxy', proxyUrl, ...baseArgs] : baseArgs;
    } else {
      console.log('Using fallback bypass method');
      const baseArgs: string[] = [
        youtubeUrl,
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        ...(ffmpegDir ? ['--ffmpeg-location', ffmpegDir] : []),
        '-o', outputPath,
        '--no-playlist', '--no-warnings', '--quiet', '--verbose',
        '--no-check-certificate', '--prefer-ffmpeg', '--extract-audio',
        '--format', 'bestaudio[height<=720]/bestaudio',
        '--retries', '3', '--fragment-retries', '3',
        '--user-agent', 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
        '--referer', 'https://www.google.com/',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--add-header', 'Accept-Encoding:gzip, deflate, br',
        '--add-header', 'Cache-Control:no-cache',
        '--add-header', 'Pragma:no-cache',
        '--sleep-interval', '1', '--max-sleep-interval', '3', '--sleep-requests', '1',
        '--extractor-args', 'youtube:player_client=ios',
        '--extractor-args', 'youtube:skip=dash,hls,webm,mp4',
        '--extractor-args', 'youtube:skip=hls',
        '--extractor-args', 'youtube:include_live_chat=false',
        '--extractor-args', 'youtube:formats=missing_pot',
        '--geo-bypass', '--geo-bypass-country', 'US',
        '--check-formats',
      ];
      args = proxyUrl ? ['--proxy', proxyUrl, ...baseArgs] : baseArgs;
    }

    const ytDlp = spawn('yt-dlp', args);
    let errorOutput = '';

    ytDlp.stdout.on('data', (data) => { console.log('yt-dlp output:', data.toString()); });
    ytDlp.stderr.on('data', (data) => { errorOutput += data.toString(); console.log('yt-dlp error:', data.toString()); });

    ytDlp.on('close', (code) => {
      if (code === 0) {
        resolve(NextResponse.json({ audioUrl: `/audio/${filename}` }));
      } else {
        console.log('First attempt failed, trying alternative format...');
        tryAlternativeFormat(youtubeUrl, outputPath, ffmpegDir, browserFingerprint, realClientIP)
          .then(resolve)
          .catch(() => {
            console.log('Alternative format failed, trying third fallback...');
            tryThirdFallback(youtubeUrl, outputPath, ffmpegDir, browserFingerprint, realClientIP, proxyUrl).then(resolve).catch(reject);
          });
      }
    });

    ytDlp.on('error', (error) => {
      console.error('yt-dlp process error:', error);
      reject(NextResponse.json({ error: 'Failed to start audio extraction process', details: (error as Error).message }, { status: 500 }));
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id, subscription_status')
      .eq('clerk_user_id', userId)
      .single();

    if (!userRow) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userRow.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const hasActiveSubscription =
      (subscription?.status === 'active' || subscription?.status === 'trialing') ||
      (userRow.subscription_status === 'active' || userRow.subscription_status === 'legacy');

    if (!hasActiveSubscription) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 402 });
    }

    const { videoId, browserFingerprint, clientIP } = await request.json();

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    const realClientIP =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') ||
      clientIP ||
      'unknown';

    const filename = `${uuidv4()}.mp3`;
    const outputPath = path.join(process.cwd(), 'public', 'audio', filename);
    await mkdir(path.join(process.cwd(), 'public', 'audio'), { recursive: true });

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const ffmpegDir = process.env.NODE_ENV === 'production' ? '' : '/opt/homebrew/bin';

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let acquired = false;
        const send = (event: StreamStatus) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        };

        try {
          send({ status: 'queued' });
          await ytDlpQueue.acquire();
          acquired = true;
          send({ status: 'processing' });

          // Choose one proxy per job and reuse for all fallbacks.
          const proxyUrl = getRandomProxyUrl();
          const maskedProxy =
            proxyUrl && proxyUrl.includes('@')
              ? proxyUrl.replace(/\/\/[^@]+@/, '//***:***@')
              : proxyUrl;
          console.log('[yt-dlp] Using proxy:', maskedProxy);

          const res = await runExtraction(
            youtubeUrl,
            outputPath,
            filename,
            ffmpegDir,
            browserFingerprint,
            realClientIP,
            proxyUrl
          );
          const data = (await res.json()) as { audioUrl?: string; error?: string; details?: string };
          if (data.audioUrl) {
            send({ status: 'done', audioUrl: data.audioUrl });
          } else {
            send({ status: 'error', error: data.error || data.details || 'Extraction failed' });
          }
        } catch (err) {
          let errMsg = err instanceof Error ? err.message : 'Extraction failed';
          const errorRes = err as NextResponse | undefined;
          if (errorRes && typeof errorRes.json === 'function') {
            try {
              const body = (await errorRes.json()) as { error?: string; details?: string };
              errMsg = body.error || body.details || errMsg;
            } catch {
              // use errMsg from above
            }
          }
          send({ status: 'error', error: errMsg });
        } finally {
          if (acquired) ytDlpQueue.release();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  } catch (error) {
    console.error('Error in extract-audio:', error);
    return NextResponse.json(
      { error: 'Failed to process audio extraction', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Alternative format extraction function
async function tryAlternativeFormat(
  youtubeUrl: string,
  outputPath: string,
  ffmpegDir: string,
  browserFingerprint?: any,
  clientIP?: string,
  proxyUrl?: string | null
): Promise<NextResponse> {
  return new Promise<NextResponse>((resolve, reject) => {
    // Use browser fingerprint if available, otherwise use fallback
    const useRealFingerprint = browserFingerprint && browserFingerprint.userAgent;
    
    let args;
    
    if (useRealFingerprint) {
      console.log('Using real browser fingerprint for alternative format');
      const baseArgs: string[] = [
        youtubeUrl,
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        ...(ffmpegDir ? ['--ffmpeg-location', ffmpegDir] : []),
        '-o', outputPath,
        '--no-playlist', '--no-warnings', '--quiet',
        '--format', 'bestaudio[height<=720]/bestaudio',
        '--retries', '2', '--fragment-retries', '2',
        '--user-agent', browserFingerprint.userAgent,
        '--referer', 'https://www.youtube.com/',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--add-header', `Accept-Language:${browserFingerprint.language}`,
        '--add-header', 'Accept-Encoding:gzip, deflate, br',
        '--add-header', 'Cache-Control:no-cache',
        '--add-header', 'Pragma:no-cache',
        '--sleep-interval', '2', '--max-sleep-interval', '4', '--sleep-requests', '2',
        '--extractor-args', 'youtube:player_client=ios',
        '--extractor-args', 'youtube:skip=dash,hls,webm,mp4',
        '--extractor-args', 'youtube:skip=hls',
        '--extractor-args', 'youtube:include_live_chat=false',
        '--extractor-args', 'youtube:formats=missing_pot',
        '--geo-bypass', '--geo-bypass-country', 'US',
        '--check-formats',
      ];
      args = proxyUrl ? ['--proxy', proxyUrl, ...baseArgs] : baseArgs;
    } else {
      console.log('Using fallback bypass for alternative format');
      const baseArgs: string[] = [
        youtubeUrl,
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        ...(ffmpegDir ? ['--ffmpeg-location', ffmpegDir] : []),
        '-o', outputPath,
        '--no-playlist', '--no-warnings', '--quiet',
        '--format', 'bestaudio[height<=720]/bestaudio',
        '--retries', '2', '--fragment-retries', '2',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--referer', 'https://www.google.com/',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--add-header', 'Accept-Encoding:gzip, deflate, br',
        '--add-header', 'Cache-Control:no-cache',
        '--add-header', 'Pragma:no-cache',
        '--sleep-interval', '2', '--max-sleep-interval', '4', '--sleep-requests', '2',
        '--extractor-args', 'youtube:player_client=ios',
        '--extractor-args', 'youtube:skip=dash,hls,webm,mp4',
        '--extractor-args', 'youtube:skip=hls',
        '--extractor-args', 'youtube:include_live_chat=false',
        '--extractor-args', 'youtube:formats=missing_pot',
        '--geo-bypass', '--geo-bypass-country', 'US',
        '--check-formats',
      ];
      args = proxyUrl ? ['--proxy', proxyUrl, ...baseArgs] : baseArgs;
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
        // Check if it's a video unavailable error
        if (errorOutput.includes('Video unavailable') || errorOutput.includes('This video is unavailable')) {
          reject(NextResponse.json({ 
            error: 'Video is unavailable or does not exist',
            details: 'The requested video may be private, deleted, or restricted in your region.',
            videoId: youtubeUrl.split('v=')[1]?.split('&')[0]
          }, { status: 404 }));
        } else {
          reject(NextResponse.json({ 
            error: 'Failed to extract audio with all available formats',
            details: errorOutput,
            videoId: youtubeUrl.split('v=')[1]?.split('&')[0]
          }, { status: 500 }));
        }
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
async function tryThirdFallback(
  youtubeUrl: string,
  outputPath: string,
  ffmpegDir: string,
  browserFingerprint?: any,
  clientIP?: string,
  proxyUrl?: string | null
): Promise<NextResponse> {
  return new Promise<NextResponse>((resolve, reject) => {
    // Use browser fingerprint if available, otherwise use fallback
    const useRealFingerprint = browserFingerprint && browserFingerprint.userAgent;
    
    let args;
    
    if (useRealFingerprint) {
      console.log('Using real browser fingerprint for third fallback');
      const baseArgs: string[] = [
        youtubeUrl,
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        ...(ffmpegDir ? ['--ffmpeg-location', ffmpegDir] : []),
        '-o', outputPath,
        '--no-playlist', '--no-warnings', '--quiet',
        '--format', 'bestaudio[height<=720]/bestaudio',
        '--retries', '2', '--fragment-retries', '2',
        '--user-agent', browserFingerprint.userAgent,
        '--referer', 'https://www.youtube.com/',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--add-header', `Accept-Language:${browserFingerprint.language}`,
        '--add-header', 'Accept-Encoding:gzip, deflate, br',
        '--add-header', 'Cache-Control:no-cache',
        '--add-header', 'Pragma:no-cache',
        '--sleep-interval', '3', '--max-sleep-interval', '6', '--sleep-requests', '3',
        '--extractor-args', 'youtube:player_client=ios',
        '--extractor-args', 'youtube:skip=dash,hls,webm,mp4',
        '--extractor-args', 'youtube:skip=hls',
        '--extractor-args', 'youtube:include_live_chat=false',
        '--extractor-args', 'youtube:formats=missing_pot',
        '--geo-bypass', '--geo-bypass-country', 'US',
        '--check-formats',
      ];
      args = proxyUrl ? ['--proxy', proxyUrl, ...baseArgs] : baseArgs;
    } else {
      console.log('Using fallback bypass for third fallback');
      const baseArgs: string[] = [
        youtubeUrl,
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        ...(ffmpegDir ? ['--ffmpeg-location', ffmpegDir] : []),
        '-o', outputPath,
        '--no-playlist', '--no-warnings', '--quiet',
        '--format', 'bestaudio[height<=720]/bestaudio',
        '--retries', '2', '--fragment-retries', '2',
        '--user-agent', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        '--referer', 'https://www.google.com/',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--add-header', 'Accept-Encoding:gzip, deflate, br',
        '--add-header', 'Cache-Control:no-cache',
        '--add-header', 'Pragma:no-cache',
        '--sleep-interval', '3', '--max-sleep-interval', '6', '--sleep-requests', '3',
        '--extractor-args', 'youtube:player_client=ios',
        '--extractor-args', 'youtube:skip=dash,hls,webm,mp4',
        '--extractor-args', 'youtube:skip=hls',
        '--extractor-args', 'youtube:include_live_chat=false',
        '--extractor-args', 'youtube:formats=missing_pot',
        '--geo-bypass', '--geo-bypass-country', 'US',
        '--check-formats',
      ];
      args = proxyUrl ? ['--proxy', proxyUrl, ...baseArgs] : baseArgs;
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
        // Check if it's a video unavailable error
        if (errorOutput.includes('Video unavailable') || errorOutput.includes('This video is unavailable')) {
          reject(NextResponse.json({ 
            error: 'Video is unavailable or does not exist',
            details: 'The requested video may be private, deleted, or restricted in your region.',
            videoId: youtubeUrl.split('v=')[1]?.split('&')[0],
            suggestion: 'Please check the video URL and try again with a different video.'
          }, { status: 404 }));
        } else {
          reject(NextResponse.json({ 
            error: 'Failed to extract audio with all available methods. YouTube may be blocking automated requests.',
            details: errorOutput,
            videoId: youtubeUrl.split('v=')[1]?.split('&')[0],
            suggestion: 'Try using a different video or check if the video is publicly available.'
          }, { status: 500 }));
        }
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