import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Static client for backward compatibility (anon key only, no JWT)
// Only create client if environment variables are available
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

/**
 * Factory function to create a Supabase client with optional Clerk JWT token
 * 
 * @param jwt - Optional Clerk JWT token. When provided, it will be sent as Authorization: Bearer <token>
 * @returns Supabase client instance, or null if environment variables are missing
 * 
 * Usage:
 * - Authenticated: createSupabaseClient(jwtToken)
 * - Guest/Anon: createSupabaseClient() or use the static `supabase` export
 */
export function createSupabaseClient(jwt?: string): SupabaseClient<Database> | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  const options: any = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }

  // If JWT is provided, set it as Authorization header
  if (jwt) {
    options.global = {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    }
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, options)
}

// Database types (we'll define these after creating the schema)
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          clerk_user_id: string
          email: string
          subscription_status: string | null
          plan_name: string | null
          stripe_customer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clerk_user_id: string
          email: string
          subscription_status?: string | null
          plan_name?: string | null
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clerk_user_id?: string
          email?: string
          subscription_status?: string | null
          plan_name?: string | null
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          stripe_subscription_id: string | null
          status: string
          plan_name: string
          current_period_start: string | null
          current_period_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_subscription_id?: string | null
          status: string
          plan_name: string
          current_period_start?: string | null
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_subscription_id?: string | null
          status?: string
          plan_name?: string
          current_period_start?: string | null
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      usage_tracking: {
        Row: {
          id: string
          user_id: string
          videos_processed: number
          total_duration_seconds: number
          last_reset_date: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          videos_processed?: number
          total_duration_seconds?: number
          last_reset_date?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          videos_processed?: number
          total_duration_seconds?: number
          last_reset_date?: string
          created_at?: string
        }
      }
    }
  }
}
