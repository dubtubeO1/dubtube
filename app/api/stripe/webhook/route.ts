import { NextRequest, NextResponse } from 'next/server';
import { stripe, getStripeProductIds } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { upsertSubscription } from '@/lib/user-sync';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Map Stripe Subscription to tier plan name using product_id.
 * Returns the tier name ('starter' | 'pro' | 'business') or null.
 */
function getPlanNameFromStripeSubscription(subscription: Stripe.Subscription): {
  planName: string | null;
  productId: string | null;
  priceId: string | null;
} {
  const priceId = subscription.items?.data[0]?.price?.id ?? null;
  const productId =
    typeof subscription.items?.data[0]?.price?.product === 'string'
      ? subscription.items.data[0].price.product
      : null;

  if (productId) {
    const ids = getStripeProductIds();
    if (productId === ids.STARTER) return { planName: 'starter', productId, priceId };
    if (productId === ids.PRO) return { planName: 'pro', productId, priceId };
    if (productId === ids.BUSINESS) return { planName: 'business', productId, priceId };
    console.warn('[Webhook] Unknown Stripe product_id:', productId);
  }

  return { planName: null, productId, priceId };
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
      console.error('[Webhook] No stripe-signature header found');
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    if (!webhookSecret) {
      console.error('[Webhook] STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch {
      console.error('[Webhook] Signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log(`[Webhook] Received ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserIdFromSession = session.metadata?.clerk_user_id;
        const stripeCustomerIdFromSession = session.customer as string;

        // Safety net: always sync stripe_customer_id to Supabase
        if (clerkUserIdFromSession && stripeCustomerIdFromSession && supabaseAdmin) {
          const { error: updateErr } = await supabaseAdmin
            .from('users')
            .update({
              stripe_customer_id: stripeCustomerIdFromSession,
              updated_at: new Date().toISOString(),
            })
            .eq('clerk_user_id', clerkUserIdFromSession);
          if (updateErr) {
            console.error('[Webhook] Failed to sync stripe_customer_id to users');
          }
        }

        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          const clerkUserId = clerkUserIdFromSession ?? subscription.metadata?.clerk_user_id;
          const stripeCustomerId = stripeCustomerIdFromSession;

          if (clerkUserId && stripeCustomerId) {
            const { planName, productId, priceId } = getPlanNameFromStripeSubscription(subscription);
            await upsertSubscription(clerkUserId, {
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscription.id,
              stripe_product_id: productId,
              stripe_price_id: priceId ?? '',
              status: subscription.status,
              cancel_at_period_end: subscription.cancel_at_period_end,
              plan_name: planName,
              subscription_ended_at: null,
            });
            console.log('[Webhook] checkout.session.completed handled');
          } else {
            console.warn('[Webhook] Missing clerk_user_id in metadata (checkout)');
          }
        } else {
          console.warn('[Webhook] Session not subscription mode or missing subscription');
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscriptionEvent = event.data.object as Stripe.Subscription;
        const clerkUserId = subscriptionEvent.metadata?.clerk_user_id;

        if (!clerkUserId) {
          console.warn('[Webhook] Missing clerk_user_id in metadata');
          break;
        }

        const fullSubscription = await stripe.subscriptions.retrieve(subscriptionEvent.id);
        const { planName, productId, priceId } = getPlanNameFromStripeSubscription(fullSubscription);
        const stripeCustomerId = fullSubscription.customer as string;

        await upsertSubscription(clerkUserId, {
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: fullSubscription.id,
          stripe_product_id: productId,
          stripe_price_id: priceId ?? '',
          status: fullSubscription.status,
          cancel_at_period_end: fullSubscription.cancel_at_period_end,
          plan_name: planName,
          subscription_ended_at: null,
        });
        console.log('[Webhook] subscription synced');
        break;
      }

      case 'customer.subscription.deleted': {
        const subscriptionEvent = event.data.object as Stripe.Subscription;
        const clerkUserId = subscriptionEvent.metadata?.clerk_user_id;

        if (clerkUserId) {
          const fullSubscription = await stripe.subscriptions.retrieve(subscriptionEvent.id);
          const { planName, productId, priceId } = getPlanNameFromStripeSubscription(fullSubscription);
          const stripeCustomerId = fullSubscription.customer as string;

          await upsertSubscription(clerkUserId, {
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: fullSubscription.id,
            stripe_product_id: productId,
            stripe_price_id: priceId ?? '',
            status: 'canceled',
            cancel_at_period_end: false,
            plan_name: planName,
            // Start the 90-day retention clock when subscription actually ends
            subscription_ended_at: new Date().toISOString(),
          });
          console.log('[Webhook] subscription deleted – synced, retention clock started');
        } else {
          console.warn('[Webhook] Missing clerk_user_id in metadata (subscription.deleted)');
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string };
        const subscriptionId = invoice.subscription;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const clerkUserId = subscription.metadata?.clerk_user_id;

          if (clerkUserId) {
            const { planName, productId, priceId } = getPlanNameFromStripeSubscription(subscription);
            const stripeCustomerId = subscription.customer as string;
            await upsertSubscription(clerkUserId, {
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscription.id,
              stripe_product_id: productId,
              stripe_price_id: priceId ?? '',
              status: subscription.status,
              cancel_at_period_end: subscription.cancel_at_period_end,
              plan_name: planName,
              subscription_ended_at: null,
            });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string };
        const subscriptionId = invoice.subscription;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const clerkUserId = subscription.metadata?.clerk_user_id;

          if (clerkUserId) {
            const { planName, productId, priceId } = getPlanNameFromStripeSubscription(subscription);
            const stripeCustomerId = subscription.customer as string;
            await upsertSubscription(clerkUserId, {
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscription.id,
              stripe_product_id: productId,
              stripe_price_id: priceId ?? '',
              status: subscription.status,
              cancel_at_period_end: subscription.cancel_at_period_end,
              plan_name: planName,
            });
          }
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Error processing webhook', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
