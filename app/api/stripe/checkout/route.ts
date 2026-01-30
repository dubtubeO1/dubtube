import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { stripe, PLAN_CONFIGS } from '@/lib/stripe';
import { syncUserToSupabase } from '@/lib/user-sync';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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

    // ---------------------------------------------------------------------
    // Backend guard: prevent users with an active subscription from
    // creating a new Stripe Checkout session.
    // ---------------------------------------------------------------------
    if (!supabaseAdmin) {
      console.error('Supabase admin client not initialized in checkout handler');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Look up the Supabase user (id, subscription_status, stripe_customer_id for reuse)
    const { data: userRow, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, subscription_status, stripe_customer_id')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !userRow) {
      console.error('Error fetching user for checkout guard:', userError || 'User not found');
      return NextResponse.json(
        { error: 'User not found in billing system' },
        { status: 400 }
      );
    }

    const { data: subscriptionRow } = await supabaseAdmin
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', userRow.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let hasActiveSubscription = false;
    const now = new Date();

    if (subscriptionRow?.current_period_end) {
      const periodEnd = new Date(subscriptionRow.current_period_end);
      const status = subscriptionRow.status;

      // Treat active / trialing Stripe statuses as an active subscription
      if (periodEnd > now && (status === 'active' || status === 'trialing')) {
        hasActiveSubscription = true;
      }
    }

    // Fallback: if no subscription row, trust users table status
    if (
      !hasActiveSubscription &&
      (userRow.subscription_status === 'active' || userRow.subscription_status === 'legacy')
    ) {
      hasActiveSubscription = true;
    }

    if (hasActiveSubscription) {
      console.log('🚫 Checkout blocked: user already has active subscription', {
        clerk_user_id: userId,
        subscription_status: subscriptionRow?.status || userRow.subscription_status,
        current_period_end: subscriptionRow?.current_period_end || null,
      });

      return NextResponse.json(
        {
          error: 'User already has an active subscription',
          redirectToPortal: true,
        },
        { status: 400 }
      );
    }

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://dubtube.net';

    // One Clerk user = one Stripe customer (lifetime). Reuse existing customer when present
    // so re-subscribing after cancel uses the same customer and webhooks link correctly.
    const existingStripeCustomerId = userRow.stripe_customer_id || null;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${BASE_URL}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/pricing?canceled=true`,
      ...(existingStripeCustomerId
        ? { customer: existingStripeCustomerId }
        : {
            customer_creation: 'always' as const,
            customer_email: user?.emailAddresses[0]?.emailAddress,
          }),
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
