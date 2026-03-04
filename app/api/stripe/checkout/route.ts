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

    const { planType } = await request.json() as { planType: string };

    if (!planType || !(planType in PLAN_CONFIGS)) {
      return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 });
    }

    const plan = PLAN_CONFIGS[planType as keyof typeof PLAN_CONFIGS];

    // Validate Price ID exists at request time (not module load time)
    if (!plan.priceId) {
      console.error(`[Checkout] Missing Price ID for plan: ${planType}`);
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

    // Ensure user exists in Supabase
    await syncUserToSupabase(user);

    if (!supabaseAdmin) {
      console.error('[Checkout] Supabase admin client not initialized');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Look up the Supabase user; retry once if missing (Clerk webhook race)
    let { data: userRow, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, subscription_status, stripe_customer_id')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !userRow) {
      console.warn('[Checkout] User not found after sync, retrying sync once');
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
      console.error('[Checkout] User not found in billing system after sync');
      return NextResponse.json(
        { error: 'Account not ready for checkout. Please try again in a moment or contact support.' },
        { status: 400 }
      );
    }

    // Guard: block only when user has an ACTIVE or TRIALING subscription
    const { data: subscriptionRow } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userRow.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let hasActiveSubscription = false;

    if (subscriptionRow && (subscriptionRow.status === 'active' || subscriptionRow.status === 'trialing')) {
      hasActiveSubscription = true;
    }

    if (
      !hasActiveSubscription &&
      subscriptionRow == null &&
      userRow.subscription_status === 'active'
    ) {
      hasActiveSubscription = true;
    }
    // Legacy users are always allowed to purchase — buying a plan naturally
    // overwrites their legacy status via the webhook.

    if (hasActiveSubscription) {
      console.log('[Checkout] Guard: blocked – user already has active subscription');
      return NextResponse.json(
        {
          error: 'User already has an active subscription',
          redirectToPortal: true,
        },
        { status: 400 }
      );
    }

    console.log('[Checkout] Guard: allowed – creating session', {
      plan: planType,
      has_stripe_customer_id: !!userRow.stripe_customer_id,
    });

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://dubtube.net';
    const existingStripeCustomerId = userRow.stripe_customer_id ?? null;
    const email = user.emailAddresses[0]?.emailAddress ?? undefined;

    if (!existingStripeCustomerId && !email) {
      console.error('[Checkout] Email required for new customer');
      return NextResponse.json(
        { error: 'Email is required to start checkout.' },
        { status: 400 }
      );
    }

    const sessionParams: {
      payment_method_types: ['card'];
      line_items: Array<{ price: string; quantity: number }>;
      mode: 'subscription';
      success_url: string;
      cancel_url: string;
      allow_promotion_codes: boolean;
      metadata: { clerk_user_id: string; plan_type: string; plan_name: string; tier: string };
      subscription_data: { metadata: { clerk_user_id: string; plan_type: string; plan_name: string; tier: string } };
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
        tier: plan.tier,
      },
      subscription_data: {
        metadata: {
          clerk_user_id: userId,
          plan_type: planType,
          plan_name: plan.name,
          tier: plan.tier,
        },
      },
    };

    if (existingStripeCustomerId) {
      sessionParams.customer = existingStripeCustomerId;
    } else {
      sessionParams.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log('[Checkout] Session created');
    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('[Checkout] Error creating checkout session', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
