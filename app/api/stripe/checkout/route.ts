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

    const user = await currentUser();
    if (!user) {
      console.error('[Checkout] currentUser() returned null for authenticated userId');
      return NextResponse.json(
        { error: 'User session could not be loaded. Please sign in again.' },
        { status: 401 }
      );
    }

    // Ensure user exists in Supabase (required for guard and for stripe_customer_id reuse)
    await syncUserToSupabase(user);

    if (!supabaseAdmin) {
      console.error('[Checkout] Supabase admin client not initialized');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Look up the Supabase user; if missing, retry sync once (handles Clerk webhook race)
    let { data: userRow, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, subscription_status, stripe_customer_id')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !userRow) {
      console.warn('[Checkout] User not found after sync, retrying sync once', { userId, userError: userError?.message });
      await syncUserToSupabase(user);
      const retry = await supabaseAdmin
        .from('users')
        .select('id, subscription_status, stripe_customer_id')
        .eq('clerk_user_id', userId)
        .single();
      userRow = retry.data;
      userError = retry.error;
    }

    if (userError || !userRow) {
      console.error('[Checkout] User not found in billing system after sync', { userId, userError: userError?.message });
      return NextResponse.json(
        { error: 'Account not ready for checkout. Please try again in a moment or contact support.' },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------------------
    // Guard: block only when user has an ACTIVE or TRIALING subscription.
    // New users (no subscription row, or status free/canceled) must NOT be blocked.
    // ---------------------------------------------------------------------
    const { data: subscriptionRow } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userRow.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let hasActiveSubscription = false;

    // Block only when subscription row has status active or trialing
    if (subscriptionRow && (subscriptionRow.status === 'active' || subscriptionRow.status === 'trialing')) {
      hasActiveSubscription = true;
    }

    // Fallback: if no subscription row, do NOT block (new user). Only trust users table when no row.
    if (
      !hasActiveSubscription &&
      subscriptionRow == null &&
      (userRow.subscription_status === 'active' || userRow.subscription_status === 'legacy')
    ) {
      hasActiveSubscription = true;
    }

    if (hasActiveSubscription) {
      console.log('[Checkout] Guard: blocked – user already has active subscription', {
        clerk_user_id: userId,
        subscription_status: subscriptionRow?.status ?? userRow.subscription_status,
      });
      return NextResponse.json(
        {
          error: 'User already has an active subscription',
          redirectToPortal: true,
        },
        { status: 400 }
      );
    }

    console.log('[Checkout] Guard: allowed – creating session', {
      clerk_user_id: userId,
      has_stripe_customer_id: !!userRow.stripe_customer_id,
    });

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://dubtube.net';
    const existingStripeCustomerId = userRow.stripe_customer_id || null;
    const email = user.emailAddresses[0]?.emailAddress ?? undefined;

    // In subscription mode Stripe does NOT allow customer_creation. Use either:
    // - customer (existing) to reuse, or
    // - customer_email (new) and Stripe creates the customer.
    if (existingStripeCustomerId) {
      // Reuse existing Stripe customer (re-subscribe, one Clerk user → one Stripe customer)
    } else {
      if (!email) {
        console.error('[Checkout] Email required for new customer', { userId });
        return NextResponse.json(
          { error: 'Email is required to start checkout.' },
          { status: 400 }
        );
      }
    }

    const sessionParams: {
      payment_method_types: ['card'];
      line_items: Array<{ price: string; quantity: number }>;
      mode: 'subscription';
      success_url: string;
      cancel_url: string;
      allow_promotion_codes: boolean;
      metadata: { clerk_user_id: string; plan_type: string; plan_name: string };
      subscription_data: { metadata: { clerk_user_id: string; plan_type: string; plan_name: string } };
      customer?: string;
      customer_email?: string;
    } = {
      payment_method_types: ['card'],
      line_items: [{ price: plan.priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${BASE_URL}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/pricing?canceled=true`,
      allow_promotion_codes: true,
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
    };

    if (existingStripeCustomerId) {
      sessionParams.customer = existingStripeCustomerId;
    } else {
      sessionParams.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log('[Checkout] Session created', { sessionId: session.id, clerk_user_id: userId });
    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('[Checkout] Error creating checkout session', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
