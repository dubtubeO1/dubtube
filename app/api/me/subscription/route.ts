import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Get user subscription status
 * Checks both users table and subscriptions table
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Get user data
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, subscription_status, plan_name, stripe_customer_id')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get subscription details if user has stripe_customer_id
    let subscriptionData = null;
    if (userData.stripe_customer_id) {
      const { data: subscription } = await supabaseAdmin
        .from('subscriptions')
        .select('status, plan_name, stripe_subscription_id')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      subscriptionData = subscription;
    }

    const status = userData.subscription_status || null;

    // Active if status is active or trialing (Stripe is source of truth for billing periods)
    const isActive =
      status === 'active' ||
      status === 'legacy' ||
      (subscriptionData?.status === 'active' || subscriptionData?.status === 'trialing');

    return NextResponse.json({
      subscription_status: status,
      plan_name: userData.plan_name || null,
      stripe_customer_id: userData.stripe_customer_id || null,
      is_active: isActive,
      stripe_subscription_id: subscriptionData?.stripe_subscription_id || null,
    });
  } catch (err) {
    console.error('Error fetching subscription')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
