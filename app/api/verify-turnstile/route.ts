import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { token, remoteip, browserFingerprint, videoId, language } = await request.json();

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing Turnstile token' },
        { status: 400 }
      );
    }

    if (!browserFingerprint) {
      return NextResponse.json(
        { success: false, error: 'Missing browser fingerprint' },
        { status: 400 }
      );
    }

    if (!videoId || !language) {
      return NextResponse.json(
        { success: false, error: 'Missing video ID or language' },
        { status: 400 }
      );
    }

    const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      console.error('Missing CLOUDFLARE_TURNSTILE_SECRET_KEY environment variable');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Prepare form data for Cloudflare Siteverify API
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    
    if (remoteip) {
      formData.append('remoteip', remoteip);
    }

    // Call Cloudflare Siteverify API
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      console.error('Cloudflare Siteverify API error:', response.status, response.statusText);
      return NextResponse.json(
        { success: false, error: 'Verification service unavailable' },
        { status: 500 }
      );
    }

    const result = await response.json();

    if (result.success) {
      // Turnstile verification successful, now start audio extraction with browser fingerprint
      try {
        console.log('Starting audio extraction with browser fingerprint for video:', videoId);
        
        // Get client IP from request headers
        const clientIP = request.headers.get('x-forwarded-for') || 
                        request.headers.get('x-real-ip') || 
                        'unknown';
        
        // Start audio extraction process with browser fingerprint
        const extractResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/extract-audio`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoId: videoId,
            language: language,
            browserFingerprint: browserFingerprint,
            clientIP: clientIP
          }),
        });

        if (!extractResponse.ok) {
          console.error('Audio extraction failed:', extractResponse.status);
          return NextResponse.json(
            { success: false, error: 'Failed to start audio extraction' },
            { status: 500 }
          );
        }

        const extractResult = await extractResponse.json();
        
        return NextResponse.json({ 
          success: true, 
          message: 'Verification successful and audio extraction started',
          data: {
            hostname: result.hostname,
            challenge_ts: result.challenge_ts,
            action: result.action,
            extractionStarted: true,
            audioPath: extractResult.audioPath
          }
        });
      } catch (extractError) {
        console.error('Error starting audio extraction:', extractError);
        return NextResponse.json(
          { success: false, error: 'Failed to start audio extraction process' },
          { status: 500 }
        );
      }
    } else {
      console.error('Turnstile verification failed:', result['error-codes']);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Verification failed',
          errorCodes: result['error-codes'] || ['unknown-error']
        },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Turnstile verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
