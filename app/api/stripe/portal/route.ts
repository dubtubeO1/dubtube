import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the Stripe customer ID from the user's subscription
    const { userData } = await request.json();
    
    if (!userData?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer found. Please contact support.' },
        { status: 400 }
      );
    }

    // Create Stripe customer portal session
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: userData.stripe_customer_id,
        return_url: `https://dubtube.net/dashboard`,
        configuration: 'bpc_1SCIMeHeI2MPXFVVS3vgow9Z', // Your portal configuration ID
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
    console.error('Error creating portal session:', error);
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
