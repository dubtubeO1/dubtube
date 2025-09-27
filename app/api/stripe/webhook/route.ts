import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { updateUserSubscription } from '@/lib/user-sync';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature')!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log('Received webhook event:', event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.metadata?.clerk_user_id;
        const planName = session.metadata?.plan_name;

        if (clerkUserId && planName) {
          await updateUserSubscription(clerkUserId, 'active', planName.toLowerCase());
          console.log(`Updated subscription for user ${clerkUserId} to ${planName}`);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const clerkUserId = subscription.metadata?.clerk_user_id;
        
        if (clerkUserId) {
          const status = subscription.status === 'active' ? 'active' : 'inactive';
          const planName = subscription.metadata?.plan_name || 'monthly';
          
          await updateUserSubscription(clerkUserId, status, planName.toLowerCase());
          console.log(`Updated subscription for user ${clerkUserId} to ${status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const clerkUserId = subscription.metadata?.clerk_user_id;
        
        if (clerkUserId) {
          await updateUserSubscription(clerkUserId, 'canceled', 'free');
          console.log(`Canceled subscription for user ${clerkUserId}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscription = (invoice as any).subscription;
        
        if (subscription) {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscription);
          const clerkUserId = stripeSubscription.metadata?.clerk_user_id;
          
          if (clerkUserId) {
            await updateUserSubscription(clerkUserId, 'active', 'monthly');
            console.log(`Payment succeeded for user ${clerkUserId}`);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscription = (invoice as any).subscription;
        
        if (subscription) {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscription);
          const clerkUserId = stripeSubscription.metadata?.clerk_user_id;
          
          if (clerkUserId) {
            await updateUserSubscription(clerkUserId, 'past_due', 'monthly');
            console.log(`Payment failed for user ${clerkUserId}`);
          }
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
