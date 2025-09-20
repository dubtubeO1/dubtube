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
      // Turnstile verification successful, return success
      // The frontend will handle the audio extraction process
      return NextResponse.json({ 
        success: true, 
        message: 'Verification successful',
        data: {
          hostname: result.hostname,
          challenge_ts: result.challenge_ts,
          action: result.action,
          videoId: videoId,
          language: language,
          browserFingerprint: browserFingerprint
        }
      });
    } else {
      console.error('Turnstile verification failed:', result['error-codes']);
      
      // Handle specific error codes
      const errorCodes = result['error-codes'] || ['unknown-error'];
      let errorMessage = 'Verification failed';
      
      if (errorCodes.includes('timeout-or-duplicate')) {
        errorMessage = 'Verification token expired or already used. Please try again.';
      } else if (errorCodes.includes('invalid-input-response')) {
        errorMessage = 'Invalid verification token. Please try again.';
      } else if (errorCodes.includes('bad-request')) {
        errorMessage = 'Verification request failed. Please try again.';
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: errorMessage,
          errorCodes: errorCodes
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
