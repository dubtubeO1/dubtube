import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { stripe, PLAN_CONFIGS } from '@/lib/stripe';
import { syncUserToSupabase } from '@/lib/user-sync';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planType } = await request.json();
    
    if (!planType || !PLAN_CONFIGS[planType as keyof typeof PLAN_CONFIGS]) {
      return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 });
    }

    const plan = PLAN_CONFIGS[planType as keyof typeof PLAN_CONFIGS];
    
    // Validate Price ID exists
    if (!plan.priceId) {
      console.error(`Missing Price ID for plan: ${planType}`);
      return NextResponse.json(
        { error: 'Subscription plan not configured' },
        { status: 500 }
      );
    }
    
    // Ensure user exists in Supabase
    const user = await currentUser();
    if (user) {
      await syncUserToSupabase(user);
    }

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://dubtube.net';

    // Create Stripe checkout session with existing Price ID
    // CRITICAL: subscription_data.metadata ensures clerk_user_id is attached to the subscription object
    // This is required for webhooks to identify which user the subscription belongs to
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription', // All plans are subscriptions
      success_url: `${BASE_URL}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/pricing?canceled=true`,
      customer_email: user?.emailAddresses[0]?.emailAddress,
      metadata: {
        clerk_user_id: userId,
        plan_type: planType,
        plan_name: plan.name,
      },
      subscription_data: {
        metadata: {
          clerk_user_id: userId,
          plan_type: planType,
          plan_name: plan.name,
        },
      },
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
