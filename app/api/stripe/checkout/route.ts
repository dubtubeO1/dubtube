import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { stripe, PLAN_CONFIGS } from '@/lib/stripe';
import { syncUserToSupabase } from '@/lib/user-sync';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planType } = await request.json();
    
    if (!planType || !PLAN_CONFIGS[planType as keyof typeof PLAN_CONFIGS]) {
      return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 });
    }

    const plan = PLAN_CONFIGS[planType as keyof typeof PLAN_CONFIGS];
    
    // Ensure user exists in Supabase
    const user = await currentUser();
    if (user) {
      await syncUserToSupabase(user);
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `DubTube ${plan.name} Plan`,
              description: `Unlimited video translation for ${plan.period}`,
            },
            unit_amount: Math.round(plan.price * 100), // Convert to cents
            recurring: planType === 'monthly' ? {
              interval: 'month',
            } : undefined,
          },
          quantity: 1,
        },
      ],
      mode: planType === 'monthly' ? 'subscription' : 'payment',
      success_url: `${request.nextUrl.origin}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.nextUrl.origin}/pricing?canceled=true`,
      customer_email: user?.emailAddresses[0]?.emailAddress,
      metadata: {
        clerk_user_id: userId,
        plan_type: planType,
        plan_name: plan.name,
      },
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
