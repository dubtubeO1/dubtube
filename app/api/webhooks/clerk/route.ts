import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  // Get the headers
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400,
    })
  }

  // Get the body
  const payload = await req.text()
  const body = JSON.parse(payload)

  // Create a new Svix instance with your secret.
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET || '')

  let evt: WebhookEvent

  // Verify the payload with the headers
  try {
    evt = wh.verify(payload, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying webhook')
    return new Response('Error occured', {
      status: 400,
    })
  }

  // Handle the webhook
  const eventType = evt.type

  if (eventType === 'user.created') {
    const { id, email_addresses, first_name, last_name } = evt.data

    console.log('User created')

    // Sync user to Supabase using admin client
    try {
      if (!supabaseAdmin) {
        console.error('Supabase admin client not initialized')
        return new Response('Server configuration error', { status: 500 })
      }

      const email = email_addresses[0]?.email_address
      if (!email) {
        console.error('No email found for user')
        return new Response('No email found', { status: 400 })
      }

      // Check if user already exists
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('clerk_user_id', id)
        .single()

      if (existingUser) {
        console.log('User already exists in Supabase')
        return new Response('User already exists', { status: 200 })
      }

      // Create new user in Supabase
      const { data: newUser, error } = await supabaseAdmin
        .from('users')
        .insert({
          clerk_user_id: id,
          email: email,
          subscription_status: 'free',
          plan_name: 'free'
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating user in Supabase')
        return new Response('Database error', { status: 500 })
      }

      console.log('Successfully synced user to Supabase')
    } catch (error) {
      console.error('Error syncing user to Supabase')
      return new Response('Internal server error', { status: 500 })
    }
  }

  if (eventType === 'user.updated') {
    const { id, email_addresses, first_name, last_name } = evt.data

    console.log('User updated')

    // You can add logic here to update user data in Supabase if needed
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data

    console.log('User deleted')

    // Delete user from Supabase using admin client
    try {
      if (!supabaseAdmin) {
        console.error('Supabase admin client not initialized')
        return new Response('Server configuration error', { status: 500 })
      }

      // Delete user from Supabase by clerk_user_id
      // CASCADE will automatically delete related records in subscriptions and usage_tracking
      const { error } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('clerk_user_id', id)

      if (error) {
        console.error('Error deleting user from Supabase')
        return new Response('Database error', { status: 500 })
      }

      console.log('Successfully deleted user from Supabase')
    } catch (error) {
      console.error('Error deleting user from Supabase')
      return new Response('Internal server error', { status: 500 })
    }
  }

  return new Response('', { status: 200 })
}
