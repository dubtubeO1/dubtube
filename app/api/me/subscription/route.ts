import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Get user subscription status
 * Checks both users table and subscriptions table
 * Respects cancel_at_period_end and current_period_end
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
        .select('status, plan_name, current_period_end, stripe_subscription_id')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      subscriptionData = subscription;
    }

    const status = userData.subscription_status || null;
    const now = new Date();
    
    // Determine if subscription is active
    // Must be 'active' status AND current_period_end must not have passed
    let isActive = false;
    if (status === 'active' || status === 'legacy') {
      if (subscriptionData?.current_period_end) {
        const periodEnd = new Date(subscriptionData.current_period_end);
        isActive = periodEnd > now; // Access until period end
      } else {
        // Fallback: if no subscription record, trust users table status
        isActive = true;
      }
    }

    return NextResponse.json({
      subscription_status: status,
      plan_name: userData.plan_name || null,
      stripe_customer_id: userData.stripe_customer_id || null,
      is_active: isActive,
      current_period_end: subscriptionData?.current_period_end || null,
      stripe_subscription_id: subscriptionData?.stripe_subscription_id || null,
    });
  } catch (err) {
    console.error('Error fetching subscription:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
