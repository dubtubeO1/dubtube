import { supabase } from './supabase'
import { User } from '@clerk/nextjs/server'

export interface UserData {
  id: string
  clerk_user_id: string
  email: string
  subscription_status: string | null
  plan_name: string | null
  stripe_customer_id: string | null
  created_at: string
  updated_at: string
}

/**
 * Sync a Clerk user to Supabase
 * This function creates a corresponding record in Supabase when a user signs up with Clerk
 */
export async function syncUserToSupabase(clerkUser: User): Promise<UserData | null> {
  try {
    if (!supabase) {
      console.error('Supabase client not initialized')
      return null
    }

    const email = clerkUser.emailAddresses[0]?.emailAddress
    
    if (!email) {
      console.error('No email found for Clerk user:', clerkUser.id)
      return null
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', clerkUser.id)
      .single()

    if (existingUser) {
      console.log('User already exists in Supabase:', clerkUser.id)
      return existingUser
    }

    // Create new user in Supabase
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        clerk_user_id: clerkUser.id,
        email: email,
        subscription_status: 'free',
        plan_name: 'free'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating user in Supabase:', error)
      return null
    }

    console.log('Successfully synced user to Supabase:', newUser)
    return newUser
  } catch (error) {
    console.error('Error in syncUserToSupabase:', error)
    return null
  }
}

/**
 * Get user data from Supabase using Clerk user ID
 */
export async function getUserFromSupabase(clerkUserId: string): Promise<UserData | null> {
  try {
    if (!supabase) {
      console.error('Supabase client not initialized')
      return null
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', clerkUserId)
      .single()

    if (error) {
      console.error('Error fetching user from Supabase:', error)
      return null
    }

    return user
  } catch (error) {
    console.error('Error in getUserFromSupabase:', error)
    return null
  }
}

/**
 * Update user subscription status
 */
export async function updateUserSubscription(
  clerkUserId: string, 
  subscriptionStatus: string, 
  planName: string,
  stripeCustomerId?: string
): Promise<boolean> {
  try {
    if (!supabase) {
      console.error('Supabase client not initialized')
      return false
    }

    const updateData: any = {
      subscription_status: subscriptionStatus,
      plan_name: planName,
      updated_at: new Date().toISOString()
    }

    if (stripeCustomerId) {
      updateData.stripe_customer_id = stripeCustomerId
    }

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('clerk_user_id', clerkUserId)

    if (error) {
      console.error('Error updating user subscription:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in updateUserSubscription:', error)
    return false
  }
}

/**
 * Track video processing usage
 */
export async function trackVideoUsage(
  clerkUserId: string, 
  durationSeconds: number
): Promise<boolean> {
  try {
    if (!supabase) {
      console.error('Supabase client not initialized')
      return false
    }

    // Get user ID from Supabase
    const user = await getUserFromSupabase(clerkUserId)
    if (!user) {
      console.error('User not found for usage tracking:', clerkUserId)
      return false
    }

    // Update or insert usage tracking
    const { error } = await supabase
      .from('usage_tracking')
      .upsert({
        user_id: user.id,
        videos_processed: 1,
        total_duration_seconds: durationSeconds,
        last_reset_date: new Date().toISOString().split('T')[0]
      }, {
        onConflict: 'user_id'
      })

    if (error) {
      console.error('Error tracking video usage:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in trackVideoUsage:', error)
    return false
  }
}
