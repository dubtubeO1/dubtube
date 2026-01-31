import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Stripe customer ID is set only after the user completes checkout at least once.
    // "No Stripe customer found" is expected when checkout has never been completed.
    const { userData } = await request.json();
    
    if (!userData?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer found. Please complete a subscription checkout first, or contact support.' },
        { status: 400 }
      );
    }

    // Create Stripe customer portal session
    try {
      const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://dubtube.net';
      const PORTAL_CONFIGURATION_ID = process.env.STRIPE_PORTAL_CONFIGURATION_ID;

      const session = await stripe.billingPortal.sessions.create({
        customer: userData.stripe_customer_id,
        return_url: `${BASE_URL}/dashboard`,
        ...(PORTAL_CONFIGURATION_ID ? { configuration: PORTAL_CONFIGURATION_ID } : {})
      });

      return NextResponse.json({ url: session.url });
    } catch (portalError: any) {
      if (portalError.code === 'resource_missing' || portalError.message?.includes('configuration')) {
        return NextResponse.json({ 
          error: 'Billing portal not configured. Please contact support.',
          details: 'The billing portal needs to be set up in Stripe Dashboard.'
        }, { status: 400 });
      }
      throw portalError;
    }
  } catch (error) {
    console.error('Error creating portal session')
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
