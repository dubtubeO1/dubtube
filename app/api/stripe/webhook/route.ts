import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { updateUserSubscription } from '@/lib/user-sync';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

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
      console.error('Signature header:', signature);
      console.error('Body length:', body.length);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log('Received webhook event:', event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.metadata?.clerk_user_id;
        const planName = session.metadata?.plan_name;
        const stripeCustomerId = session.customer as string;

        if (clerkUserId && planName) {
          await updateUserSubscription(clerkUserId, 'active', planName.toLowerCase(), stripeCustomerId);
          console.log(`Updated subscription for user ${clerkUserId} to ${planName}`);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const clerkUserId = subscription.metadata?.clerk_user_id;
        
        if (clerkUserId) {
          let status = 'active';
          let planName = 'monthly';
          
          // Handle different subscription statuses
          if (subscription.status === 'active') {
            status = 'active';
          } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
            status = 'canceled';
          } else if (subscription.status === 'past_due') {
            status = 'past_due';
          } else if (subscription.status === 'incomplete' || subscription.status === 'incomplete_expired') {
            status = 'incomplete';
          }
          
          // Determine plan name from subscription items
          if (subscription.items?.data?.[0]?.price?.nickname) {
            const priceNickname = subscription.items.data[0].price.nickname.toLowerCase();
            if (priceNickname.includes('yearly') || priceNickname.includes('annual')) {
              planName = 'annual';
            } else if (priceNickname.includes('quarterly') || priceNickname.includes('3 month')) {
              planName = 'quarterly';
            } else {
              planName = 'monthly';
            }
          } else {
            // Fallback to metadata or default
            planName = subscription.metadata?.plan_name?.toLowerCase() || 'monthly';
          }
          
          await updateUserSubscription(clerkUserId, status, planName);
          console.log(`Updated subscription for user ${clerkUserId} to ${status} (${planName})`);
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

      case 'invoice.upcoming': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscription = (invoice as any).subscription;
        
        if (subscription) {
          console.log(`Upcoming invoice for subscription ${subscription}`);
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
