import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_PRICE_IDS } from '@/lib/stripe';
import { upsertSubscription, updateUserSubscription } from '@/lib/user-sync';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Map Stripe Price ID to plan name using .env variables
 * Returns plan name or null if price ID is unknown (caller should handle)
 */
function getPlanNameFromPriceId(priceId: string): string | null {
  if (priceId === STRIPE_PRICE_IDS.MONTHLY) {
    return 'monthly';
  } else if (priceId === STRIPE_PRICE_IDS.QUARTERLY) {
    return 'quarterly';
  } else if (priceId === STRIPE_PRICE_IDS.ANNUAL) {
    return 'annual';
  }
  // Unknown price ID - log warning but return null (don't silently default)
  console.warn(`⚠️ Unknown Price ID: ${priceId} - not matching any configured price IDs`);
  return null;
}

/**
 * Stripe webhook handler for subscription events
 * Handles subscription lifecycle and mirrors state to Supabase
 */
export async function POST(request: NextRequest) {
  console.log("🔔 Stripe webhook received");
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      console.error('No stripe-signature header found');
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log("📦 Stripe event type:", event.type);
    console.log(`[Webhook] Received event: ${event.type} (id: ${event.id})`);

    // Handle idempotency: Check if we've processed this event before
    // Note: In production, you might want to store event IDs in a database
    // For now, we rely on Stripe's idempotency and our upsert logic

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Only process if it's a subscription checkout
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          
          const clerkUserId = session.metadata?.clerk_user_id || subscription.metadata?.clerk_user_id;
          const stripeCustomerId = session.customer as string;
          
          if (clerkUserId && stripeCustomerId && subscription) {
            console.log("🔍 Resolving user for subscription");
            const priceId = subscription.items.data[0]?.price.id;
            const planName = priceId ? getPlanNameFromPriceId(priceId) : (session.metadata?.plan_name?.toLowerCase() || 'monthly');
            
            console.log("⬆️ Calling upsertSubscription");
            const subData = subscription as any; // Stripe types may not include all fields
            // Debug: Log raw Stripe timestamps before conversion
            console.log("🕐 Raw Stripe timestamps:", {
              current_period_start: subData.current_period_start,
              current_period_end: subData.current_period_end,
              cancel_at_period_end: subData.cancel_at_period_end,
            });
            // Safe timestamp conversion: Stripe returns seconds, multiply by 1000 for milliseconds
            const periodStart = subData.current_period_start
              ? new Date(subData.current_period_start * 1000)
              : null;
            const periodEnd = subData.current_period_end
              ? new Date(subData.current_period_end * 1000)
              : null;
            // Map price ID to plan name - log warning if unknown but still store price_id
            const mappedPlanName = priceId ? (getPlanNameFromPriceId(priceId) || 'unknown') : (session.metadata?.plan_name?.toLowerCase() || 'monthly');
            if (priceId && !getPlanNameFromPriceId(priceId)) {
              console.warn(`⚠️ Unknown price ID ${priceId} in checkout - storing price_id but plan_name may be incorrect`);
            }
            await upsertSubscription(clerkUserId, {
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscription.id,
              stripe_price_id: priceId || '',
              status: subscription.status,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              cancel_at_period_end: subData.cancel_at_period_end || false,
              plan_name: mappedPlanName,
            });
            
            console.log(`[Webhook] Checkout completed for user ${clerkUserId}, subscription ${subscription.id}`);
          } else {
            console.warn("⛔ Early return: missing clerkUserId, stripeCustomerId, or subscription");
          }
        } else {
          console.warn("⛔ Early return: session is not subscription mode or missing subscription");
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        if (event.type === 'customer.subscription.created') {
          console.log("🧾 subscription.created received");
        }
        const subscriptionEvent = event.data.object as Stripe.Subscription;
        console.log("🆔 Stripe subscription ID:", subscriptionEvent.id);
        console.log("👤 Stripe customer ID:", subscriptionEvent.customer);
        console.log("🏷 subscription.metadata:", subscriptionEvent.metadata);
        const clerkUserId = subscriptionEvent.metadata?.clerk_user_id;
        
        if (!clerkUserId) {
          console.warn("⛔ Early return: missing clerk_user_id in metadata");
          console.warn(`[Webhook] ${event.type} missing clerk_user_id in metadata`);
          break;
        }

        // CRITICAL: Always fetch full subscription from Stripe API to ensure complete state
        console.log("📥 Fetching full subscription from Stripe API...");
        const fullSubscription = await stripe.subscriptions.retrieve(subscriptionEvent.id);
        console.log("✅ Full subscription retrieved");
        const subData = fullSubscription as any; // Stripe types may not include all fields

        console.log("🔍 Resolving user for subscription");
        const priceId = subData.items.data[0]?.price.id;
        if (!priceId) {
          console.warn("⛔ Early return: missing price ID for subscription");
          console.error(`[Webhook] ${event.type} missing price ID for subscription ${fullSubscription.id}`);
          break;
        }

        // Map price ID to plan name - log warning if unknown but still store price_id
        const planName = getPlanNameFromPriceId(priceId);
        if (!planName) {
          console.warn(`⚠️ Unknown price ID ${priceId} - storing price_id but plan_name will be null`);
        }
        const stripeCustomerId = subData.customer as string;

        console.log("⬆️ Calling upsertSubscription");
        // Debug: Log raw Stripe timestamps before conversion
        console.log("🕐 Raw Stripe timestamps:", {
          current_period_start: subData.current_period_start,
          current_period_end: subData.current_period_end,
          cancel_at_period_end: subData.cancel_at_period_end,
        });
        // Safe timestamp conversion: Stripe returns seconds, multiply by 1000 for milliseconds
        const periodStart = subData.current_period_start
          ? new Date(subData.current_period_start * 1000)
          : null;
        const periodEnd = subData.current_period_end
          ? new Date(subData.current_period_end * 1000)
          : null;
        
        // Ensure cancel_at_period_end is correctly read from full subscription
        const cancelAtPeriodEnd = subData.cancel_at_period_end || false;
        
        await upsertSubscription(clerkUserId, {
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: fullSubscription.id,
          stripe_price_id: priceId,
          status: fullSubscription.status,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          cancel_at_period_end: cancelAtPeriodEnd,
          plan_name: planName || 'unknown', // Fallback only if truly unknown
        });

        console.log(`[Webhook] Subscription ${fullSubscription.status} for user ${clerkUserId} (cancel_at_period_end: ${cancelAtPeriodEnd})`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscriptionEvent = event.data.object as Stripe.Subscription;
        const clerkUserId = subscriptionEvent.metadata?.clerk_user_id;
        
        if (clerkUserId) {
          // CRITICAL: Always fetch full subscription from Stripe API to ensure complete state
          console.log("📥 Fetching full subscription from Stripe API...");
          const fullSubscription = await stripe.subscriptions.retrieve(subscriptionEvent.id);
          console.log("✅ Full subscription retrieved");
          const subData = fullSubscription as any; // Stripe types may not include all fields

          console.log("🔍 Resolving user for subscription");
          const priceId = subData.items.data[0]?.price.id;
          const planName = priceId ? (getPlanNameFromPriceId(priceId) || 'unknown') : 'free';
          const stripeCustomerId = subData.customer as string;

          console.log("⬆️ Calling upsertSubscription");
          // Subscription is deleted - mark as canceled
          // Debug: Log raw Stripe timestamps before conversion
          console.log("🕐 Raw Stripe timestamps:", {
            current_period_start: subData.current_period_start,
            current_period_end: subData.current_period_end,
            cancel_at_period_end: subData.cancel_at_period_end,
          });
          // Safe timestamp conversion: Stripe returns seconds, multiply by 1000 for milliseconds
          const periodStart = subData.current_period_start
            ? new Date(subData.current_period_start * 1000)
            : null;
          const periodEnd = subData.current_period_end
            ? new Date(subData.current_period_end * 1000)
            : null;
          await upsertSubscription(clerkUserId, {
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: fullSubscription.id,
            stripe_price_id: priceId || '',
            status: 'canceled',
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false, // Deleted subscriptions are not canceling at period end
            plan_name: planName,
          });

          console.log(`[Webhook] Subscription deleted for user ${clerkUserId}`);
        } else {
          console.warn("⛔ Early return: missing clerk_user_id in subscription.deleted metadata");
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceData = invoice as any; // Stripe types may not include all fields
        const subscriptionId = invoiceData.subscription as string;
        
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const clerkUserId = subscription.metadata?.clerk_user_id;
          
          if (clerkUserId) {
            console.log("🔍 Resolving user for subscription");
            const priceId = subscription.items.data[0]?.price.id;
            // Map price ID to plan name - log warning if unknown but still store price_id
            const planName = priceId ? (getPlanNameFromPriceId(priceId) || 'unknown') : 'monthly';
            if (priceId && !getPlanNameFromPriceId(priceId)) {
              console.warn(`⚠️ Unknown price ID ${priceId} in invoice.payment_succeeded - storing price_id but plan_name may be incorrect`);
            }
            const stripeCustomerId = subscription.customer as string;

            console.log("⬆️ Calling upsertSubscription");
            const subData = subscription as any; // Stripe types may not include all fields
            // Debug: Log raw Stripe timestamps before conversion
            console.log("🕐 Raw Stripe timestamps:", {
              current_period_start: subData.current_period_start,
              current_period_end: subData.current_period_end,
              cancel_at_period_end: subData.cancel_at_period_end,
            });
            // Safe timestamp conversion: Stripe returns seconds, multiply by 1000 for milliseconds
            const periodStart = subData.current_period_start
              ? new Date(subData.current_period_start * 1000)
              : null;
            const periodEnd = subData.current_period_end
              ? new Date(subData.current_period_end * 1000)
              : null;
            await upsertSubscription(clerkUserId, {
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscription.id,
              stripe_price_id: priceId || '',
              status: subscription.status, // Use subscription status, not invoice status
              current_period_start: periodStart,
              current_period_end: periodEnd,
              cancel_at_period_end: subData.cancel_at_period_end || false,
              plan_name: planName,
            });

            console.log(`[Webhook] Payment succeeded for user ${clerkUserId}`);
          } else {
            console.warn("⛔ Early return: missing clerk_user_id in invoice.payment_succeeded");
          }
        } else {
          console.warn("⛔ Early return: missing subscription ID in invoice.payment_succeeded");
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceData = invoice as any; // Stripe types may not include all fields
        const subscriptionId = invoiceData.subscription as string;
        
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const clerkUserId = subscription.metadata?.clerk_user_id;
          
          if (clerkUserId) {
            console.log("🔍 Resolving user for subscription");
            const priceId = subscription.items.data[0]?.price.id;
            // Map price ID to plan name - log warning if unknown but still store price_id
            const planName = priceId ? (getPlanNameFromPriceId(priceId) || 'unknown') : 'monthly';
            if (priceId && !getPlanNameFromPriceId(priceId)) {
              console.warn(`⚠️ Unknown price ID ${priceId} in invoice.payment_failed - storing price_id but plan_name may be incorrect`);
            }
            const stripeCustomerId = subscription.customer as string;

            console.log("⬆️ Calling upsertSubscription");
            const subData = subscription as any; // Stripe types may not include all fields
            // Debug: Log raw Stripe timestamps before conversion
            console.log("🕐 Raw Stripe timestamps:", {
              current_period_start: subData.current_period_start,
              current_period_end: subData.current_period_end,
              cancel_at_period_end: subData.cancel_at_period_end,
            });
            // Safe timestamp conversion: Stripe returns seconds, multiply by 1000 for milliseconds
            const periodStart = subData.current_period_start
              ? new Date(subData.current_period_start * 1000)
              : null;
            const periodEnd = subData.current_period_end
              ? new Date(subData.current_period_end * 1000)
              : null;
            await upsertSubscription(clerkUserId, {
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscription.id,
              stripe_price_id: priceId || '',
              status: subscription.status, // Stripe sets this to 'past_due' or 'unpaid'
              current_period_start: periodStart,
              current_period_end: periodEnd,
              cancel_at_period_end: subData.cancel_at_period_end || false,
              plan_name: planName,
            });

            console.log(`[Webhook] Payment failed for user ${clerkUserId}, status: ${subscription.status}`);
          } else {
            console.warn("⛔ Early return: missing clerk_user_id in invoice.payment_failed");
          }
        } else {
          console.warn("⛔ Early return: missing subscription ID in invoice.payment_failed");
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
