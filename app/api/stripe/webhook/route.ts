import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_PRICE_IDS, STRIPE_PRODUCT_IDS } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { upsertSubscription, updateUserSubscription } from '@/lib/user-sync';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Map Stripe Price ID to plan name using .env variables
 * Returns plan name or null if price ID is unknown (caller should handle)
 * Used as fallback when product_id mapping fails
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
 * Map Stripe Subscription to plan name using product_id (preferred) or price_id (fallback)
 * Returns plan name or null if no mapping matches
 */
function getPlanNameFromStripeSubscription(subscription: any): {
  planName: string | null;
  productId: string | null;
  priceId: string | null;
} {
  const priceId = subscription.items?.data[0]?.price?.id || null;
  const productId = subscription.items?.data[0]?.price?.product || null;

  // Prefer mapping by product_id
  if (productId) {
    if (productId === STRIPE_PRODUCT_IDS.MONTHLY) {
      return { planName: 'monthly', productId, priceId };
    } else if (productId === STRIPE_PRODUCT_IDS.QUARTERLY) {
      return { planName: 'quarterly', productId, priceId };
    } else if (productId === STRIPE_PRODUCT_IDS.ANNUAL) {
      return { planName: 'annual', productId, priceId };
    }
    // Unknown product_id - log warning
    console.warn(`⚠️ Unknown Stripe product_id: ${productId}`);
  }

  // Fallback to price_id mapping if product_id mapping failed
  if (priceId) {
    const planNameFromPrice = getPlanNameFromPriceId(priceId);
    if (planNameFromPrice) {
      console.warn(`⚠️ Using price_id fallback for plan mapping (product_id: ${productId || 'missing'})`);
      return { planName: planNameFromPrice, productId, priceId };
    }
  }

  // No mapping found
  return { planName: null, productId, priceId };
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
        const clerkUserIdFromSession = session.metadata?.clerk_user_id;
        const stripeCustomerIdFromSession = session.customer as string;

        // Safety net: always sync stripe_customer_id to Supabase so one Clerk user maps to one Stripe customer.
        // If Stripe ever created a new customer, we self-heal so the next checkout reuses it.
        if (clerkUserIdFromSession && stripeCustomerIdFromSession && supabaseAdmin) {
          const { error: updateErr } = await supabaseAdmin
            .from('users')
            .update({
              stripe_customer_id: stripeCustomerIdFromSession,
              updated_at: new Date().toISOString(),
            })
            .eq('clerk_user_id', clerkUserIdFromSession);
          if (updateErr) {
            console.error('[Webhook] Failed to sync stripe_customer_id to users:', updateErr);
          }
        }

        // Only process subscription creation/upsert if it's a subscription checkout
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          
          const clerkUserId = clerkUserIdFromSession || subscription.metadata?.clerk_user_id;
          const stripeCustomerId = stripeCustomerIdFromSession;
          
          if (clerkUserId && stripeCustomerId && subscription) {
            console.log("🔍 Resolving user for subscription");
            const subData = subscription as any;
            const { planName, productId, priceId } = getPlanNameFromStripeSubscription(subData);
            console.log("🧩 Subscription mapping", {
              product_id: productId,
              price_id: priceId,
              resolved_plan_name: planName,
            });
            console.log("⬆️ Calling upsertSubscription");
            await upsertSubscription(clerkUserId, {
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscription.id,
              stripe_product_id: productId,
              stripe_price_id: priceId || '',
              status: subscription.status,
              cancel_at_period_end: subData.cancel_at_period_end || false,
              plan_name: planName,
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
        
        // Map subscription to plan name using product_id (preferred) or price_id (fallback)
        const { planName, productId, priceId } = getPlanNameFromStripeSubscription(subData);
        
        const stripeCustomerId = subData.customer as string;
        const cancelAtPeriodEnd = subData.cancel_at_period_end || false;
        console.log("🧩 Subscription mapping", {
          product_id: productId,
          price_id: priceId,
          resolved_plan_name: planName,
        });
        console.log("⬆️ Calling upsertSubscription");
        await upsertSubscription(clerkUserId, {
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: fullSubscription.id,
          stripe_product_id: productId,
          stripe_price_id: priceId || '',
          status: fullSubscription.status,
          cancel_at_period_end: cancelAtPeriodEnd,
          plan_name: planName,
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
          
          // Map subscription to plan name using product_id (preferred) or price_id (fallback)
          const { planName, productId, priceId } = getPlanNameFromStripeSubscription(subData);
          
          const stripeCustomerId = subData.customer as string;
          console.log("🧩 Subscription mapping", {
            product_id: productId,
            price_id: priceId,
            resolved_plan_name: planName,
          });
          console.log("⬆️ Calling upsertSubscription");
          await upsertSubscription(clerkUserId, {
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: fullSubscription.id,
            stripe_product_id: productId,
            stripe_price_id: priceId || '',
            status: 'canceled',
            cancel_at_period_end: false,
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
            const subData = subscription as any;
            const { planName, productId, priceId } = getPlanNameFromStripeSubscription(subData);
            const stripeCustomerId = subscription.customer as string;
            console.log("🧩 Subscription mapping", {
              product_id: productId,
              price_id: priceId,
              resolved_plan_name: planName,
            });
            console.log("⬆️ Calling upsertSubscription");
            await upsertSubscription(clerkUserId, {
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscription.id,
              stripe_product_id: productId,
              stripe_price_id: priceId || '',
              status: subscription.status,
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
            const subData = subscription as any;
            const { planName, productId, priceId } = getPlanNameFromStripeSubscription(subData);
            const stripeCustomerId = subscription.customer as string;
            console.log("🧩 Subscription mapping", {
              product_id: productId,
              price_id: priceId,
              resolved_plan_name: planName,
            });
            console.log("⬆️ Calling upsertSubscription");
            await upsertSubscription(clerkUserId, {
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscription.id,
              stripe_product_id: productId,
              stripe_price_id: priceId || '',
              status: subscription.status,
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
