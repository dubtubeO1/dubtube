import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { syncUserToSupabase } from '@/lib/user-sync'

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
    console.error('Error verifying webhook:', err)
    return new Response('Error occured', {
      status: 400,
    })
  }

  // Handle the webhook
  const eventType = evt.type

  if (eventType === 'user.created') {
    const { id, email_addresses, first_name, last_name } = evt.data

    console.log('User created:', { id, email_addresses, first_name, last_name })

    // Sync user to Supabase
    try {
      const userData = {
        id,
        emailAddresses: email_addresses,
        firstName: first_name,
        lastName: last_name,
      } as any

      await syncUserToSupabase(userData)
      console.log('Successfully synced user to Supabase:', id)
    } catch (error) {
      console.error('Error syncing user to Supabase:', error)
    }
  }

  if (eventType === 'user.updated') {
    const { id, email_addresses, first_name, last_name } = evt.data

    console.log('User updated:', { id, email_addresses, first_name, last_name })

    // You can add logic here to update user data in Supabase if needed
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data

    console.log('User deleted:', id)

    // You can add logic here to handle user deletion in Supabase if needed
  }

  return new Response('', { status: 200 })
}
