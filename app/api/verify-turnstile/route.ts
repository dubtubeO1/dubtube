import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { token, remoteip } = await request.json();

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing Turnstile token' },
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
      return NextResponse.json({ 
        success: true, 
        message: 'Verification successful',
        data: {
          hostname: result.hostname,
          challenge_ts: result.challenge_ts,
          action: result.action
        }
      });
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
