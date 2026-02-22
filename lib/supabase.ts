import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Factory function to create a Supabase client with optional Clerk JWT token
 * 
 * @param jwt - Optional Clerk JWT token. When provided, it will be sent as Authorization: Bearer <token>
 * @returns Supabase client instance, or null if environment variables are missing
 * 
 * Usage:
 * - Authenticated: createSupabaseClient(jwtToken)
 * - Guest/Anon: createSupabaseClient()
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
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_subscription_id?: string | null
          status: string
          plan_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_subscription_id?: string | null
          status?: string
          plan_name?: string
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
      projects: {
        Row: {
          id: string
          user_id: string
          title: string
          status: string
          source_language: string | null
          target_language: string | null
          video_r2_key: string | null
          audio_r2_key: string | null
          dubbed_audio_r2_key: string | null
          video_size_bytes: number | null
          error_message: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          status?: string
          source_language?: string | null
          target_language?: string | null
          video_r2_key?: string | null
          audio_r2_key?: string | null
          dubbed_audio_r2_key?: string | null
          video_size_bytes?: number | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          status?: string
          source_language?: string | null
          target_language?: string | null
          video_r2_key?: string | null
          audio_r2_key?: string | null
          dubbed_audio_r2_key?: string | null
          video_size_bytes?: number | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      transcripts: {
        Row: {
          id: string
          project_id: string
          speaker_id: string | null
          speaker_name: string | null
          start_time: number | null
          end_time: number | null
          original_text: string | null
          translated_text: string | null
          segment_audio_r2_key: string | null
          voice_id: string | null
          is_cloned: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          speaker_id?: string | null
          speaker_name?: string | null
          start_time?: number | null
          end_time?: number | null
          original_text?: string | null
          translated_text?: string | null
          segment_audio_r2_key?: string | null
          voice_id?: string | null
          is_cloned?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          speaker_id?: string | null
          speaker_name?: string | null
          start_time?: number | null
          end_time?: number | null
          original_text?: string | null
          translated_text?: string | null
          segment_audio_r2_key?: string | null
          voice_id?: string | null
          is_cloned?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      speakers: {
        Row: {
          id: string
          project_id: string
          speaker_id: string
          speaker_name: string | null
          voice_id: string | null
          is_cloned: boolean
          cloned_voice_r2_key: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          speaker_id: string
          speaker_name?: string | null
          voice_id?: string | null
          is_cloned?: boolean
          cloned_voice_r2_key?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          speaker_id?: string
          speaker_name?: string | null
          voice_id?: string | null
          is_cloned?: boolean
          cloned_voice_r2_key?: string | null
          created_at?: string
        }
      }
    }
  }
}
