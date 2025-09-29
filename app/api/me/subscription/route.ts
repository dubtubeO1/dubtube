import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(): Promise<NextResponse> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('subscription_status, plan_name, stripe_customer_id')
      .eq('clerk_user_id', userId)
      .single();

    if (error) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const status = data?.subscription_status || null;
    const isActive = status === 'active' || status === 'legacy';

    return NextResponse.json({
      subscription_status: status,
      plan_name: data?.plan_name || null,
      stripe_customer_id: data?.stripe_customer_id || null,
      is_active: isActive,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
