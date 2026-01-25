import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_PRICE_IDS } from '@/lib/stripe';
import { upsertSubscription, updateUserSubscription } from '@/lib/user-sync';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Map Stripe Price ID to plan name
 */
function getPlanNameFromPriceId(priceId: string): string {
  if (priceId === STRIPE_PRICE_IDS.MONTHLY) {
    return 'monthly';
  } else if (priceId === STRIPE_PRICE_IDS.QUARTERLY) {
    return 'quarterly';
  } else if (priceId === STRIPE_PRICE_IDS.ANNUAL) {
    return 'annual';
  }
  // Fallback: try to determine from price ID or return default
  console.warn(`Unknown Price ID: ${priceId}, defaulting to monthly`);
  return 'monthly';
}

/**
 * Stripe webhook handler for subscription events
 * Handles subscription lifecycle and mirrors state to Supabase
 */
export async function POST(request: NextRequest) {
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
            const priceId = subscription.items.data[0]?.price.id;
            const planName = priceId ? getPlanNameFromPriceId(priceId) : (session.metadata?.plan_name?.toLowerCase() || 'monthly');
            
            const subData = subscription as any; // Stripe types may not include all fields
            await upsertSubscription(clerkUserId, {
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscription.id,
              stripe_price_id: priceId || '',
              status: subscription.status,
              current_period_start: new Date(subData.current_period_start * 1000),
              current_period_end: new Date(subData.current_period_end * 1000),
              cancel_at_period_end: subData.cancel_at_period_end || false,
              plan_name: planName,
            });
            
            console.log(`[Webhook] Checkout completed for user ${clerkUserId}, subscription ${subscription.id}`);
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const clerkUserId = subscription.metadata?.clerk_user_id;
        
        if (!clerkUserId) {
          console.warn(`[Webhook] ${event.type} missing clerk_user_id in metadata`);
          break;
        }

        const priceId = subscription.items.data[0]?.price.id;
        if (!priceId) {
          console.error(`[Webhook] ${event.type} missing price ID for subscription ${subscription.id}`);
          break;
        }

        const planName = getPlanNameFromPriceId(priceId);
        const stripeCustomerId = subscription.customer as string;

        const subData = subscription as any; // Stripe types may not include all fields
        await upsertSubscription(clerkUserId, {
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: priceId,
          status: subscription.status,
          current_period_start: new Date(subData.current_period_start * 1000),
          current_period_end: new Date(subData.current_period_end * 1000),
          cancel_at_period_end: subData.cancel_at_period_end || false,
          plan_name: planName,
        });

        console.log(`[Webhook] Subscription ${subscription.status} for user ${clerkUserId} (cancel_at_period_end: ${subscription.cancel_at_period_end})`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const clerkUserId = subscription.metadata?.clerk_user_id;
        
        if (clerkUserId) {
          const priceId = subscription.items.data[0]?.price.id;
          const planName = priceId ? getPlanNameFromPriceId(priceId) : 'free';
          const stripeCustomerId = subscription.customer as string;

          // Subscription is deleted - mark as canceled
          const subData = subscription as any; // Stripe types may not include all fields
          await upsertSubscription(clerkUserId, {
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: subscription.id,
            stripe_price_id: priceId || '',
            status: 'canceled',
            current_period_start: new Date(subData.current_period_start * 1000),
            current_period_end: new Date(subData.current_period_end * 1000),
            cancel_at_period_end: false,
            plan_name: planName,
          });

          console.log(`[Webhook] Subscription deleted for user ${clerkUserId}`);
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
            const priceId = subscription.items.data[0]?.price.id;
            const planName = priceId ? getPlanNameFromPriceId(priceId) : 'monthly';
            const stripeCustomerId = subscription.customer as string;
            const subData = subscription as any; // Stripe types may not include all fields

            await upsertSubscription(clerkUserId, {
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscription.id,
              stripe_price_id: priceId || '',
              status: subscription.status, // Use subscription status, not invoice status
              current_period_start: new Date(subData.current_period_start * 1000),
              current_period_end: new Date(subData.current_period_end * 1000),
              cancel_at_period_end: subData.cancel_at_period_end || false,
              plan_name: planName,
            });

            console.log(`[Webhook] Payment succeeded for user ${clerkUserId}`);
          }
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
            const priceId = subscription.items.data[0]?.price.id;
            const planName = priceId ? getPlanNameFromPriceId(priceId) : 'monthly';
            const stripeCustomerId = subscription.customer as string;
            const subData = subscription as any; // Stripe types may not include all fields

            await upsertSubscription(clerkUserId, {
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscription.id,
              stripe_price_id: priceId || '',
              status: subscription.status, // Stripe sets this to 'past_due' or 'unpaid'
              current_period_start: new Date(subData.current_period_start * 1000),
              current_period_end: new Date(subData.current_period_end * 1000),
              cancel_at_period_end: subData.cancel_at_period_end || false,
              plan_name: planName,
            });

            console.log(`[Webhook] Payment failed for user ${clerkUserId}, status: ${subscription.status}`);
          }
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
