import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client using the service role key.
// IMPORTANT: Never expose SUPABASE_SERVICE_ROLE_KEY to the client.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null


