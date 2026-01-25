import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Cancel subscription endpoint
 * Sets cancel_at_period_end = true in Stripe
 * Access remains active until current_period_end
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Get user's Stripe subscription ID
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id')
      .eq('clerk_user_id', userId)
      .single();

    if (!user?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      );
    }

    // Get active subscription from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripe_customer_id,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      );
    }

    const subscription = subscriptions.data[0];

    // If already set to cancel, return early
    if (subscription.cancel_at_period_end) {
      const subData = subscription as any; // Stripe types may not include all fields
      return NextResponse.json({
        message: 'Subscription is already set to cancel at period end',
        cancel_at_period_end: true,
        current_period_end: new Date(subData.current_period_end * 1000).toISOString(),
      });
    }

    // Update subscription to cancel at period end
    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });

    console.log(`[Cancel] Subscription ${subscription.id} set to cancel at period end for user ${userId}`);

    const subData = updatedSubscription as any; // Stripe types may not include all fields
    return NextResponse.json({
      message: 'Subscription will be canceled at the end of the current billing period',
      cancel_at_period_end: true,
      current_period_end: new Date(subData.current_period_end * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    
    if (error.type === 'StripeInvalidRequestError') {
      return NextResponse.json(
        { error: 'Invalid subscription request' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}
