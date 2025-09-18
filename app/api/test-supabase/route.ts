import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ 
        error: 'Supabase admin client not initialized',
        hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL
      }, { status: 500 })
    }

    // Test basic connection
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('count')
      .limit(1)

    if (error) {
      return NextResponse.json({ 
        error: 'Supabase connection failed',
        details: error.message,
        code: error.code
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Supabase connection working',
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL
    })

  } catch (error) {
    return NextResponse.json({ 
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
