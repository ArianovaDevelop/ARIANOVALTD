import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { client } from '@/sanity/lib/client'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env.local')
  }

  // Get the headers from Next.js 15
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  // If there are no identifying headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- missing svix headers', {
      status: 400,
    })
  }

  const payload = await req.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: WebhookEvent

  // ============================================================================
  // SECURITY LAYER: SVIX PAYLOAD VERIFICATION
  // ============================================================================
  // Clerk uses Svix to sign their webhooks. We must cryptographically verify that
  // the incoming request actually came from Clerk, otherwise malicious actors could
  // forge account creation requests and hijack user profiles.
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying Clerk webhook:', err)
    return new Response('Error verifying webhook signature', {
      status: 400,
    })
  }

  const writeClient = client.withConfig({
    token: process.env.SANITY_WRITE_TOKEN,
  })

  // ============================================================================
  // IDENTITY SYNCHRONIZATION: CLERK -> SANITY
  // ============================================================================
  // When a user signs up on the frontend via Clerk, we immediately catch that event
  // here and replicate the user inside our Sanity CMS as a `customer` document.
  // This allows the admin team to view orders attached natively to the user profile
  // inside the Sanity Studio dashboard without ever needing to log into Clerk.
  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    const { id: clerkId, email_addresses, first_name, last_name } = evt.data
    const primaryEmail = email_addresses?.[0]?.email_address || ''

    // --- SMART NAME RESOLUTION ---
    // Users often sign up with just an email or a social login that doesn't provide
    // a clean First/Last name. We run a cascade of fallbacks to ensure every customer
    // gets a beautifully formatted name in the CMS (e.g. "Antonio" instead of "antonio_35").
    let fullName = [first_name, last_name].filter(Boolean).join(' ').trim()
    
    if (!fullName && primaryEmail) {
      // Clean up email prefix (remove numbers/special symbols for a cleaner name)
      const prefix = primaryEmail.split('@')[0]
      fullName = prefix
        .replace(/[._+]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .replace(/[0-9]/g, '')
        .trim();
    }

    if (!fullName) fullName = 'Anonymous Connoisseur'

    try {
      // --- UPSERT LOGIC ---
      // 1. `createIfNotExists`: Initializes the profile safely if this is a new signup.
      // 2. `patch`: Overwrites the name/email if the user is just updating their Clerk profile.
      await writeClient.createIfNotExists({
        _id: `customer-${clerkId}`,
        _type: 'customer',
        clerkId,
        email: primaryEmail,
      })

      // Patch the name and email (in case they changed email too)
      await writeClient.patch(`customer-${clerkId}`)
        .set({ fullName, email: primaryEmail })
        .commit()

      console.log(`✅ [Webhook] Synchronized profile for ${clerkId} (${fullName})`)
    } catch (error) {
      console.error('❌ [Webhook Error] Sanity Sync Failed:', error)
      return NextResponse.json({ error: 'Failed to sync Sanity profile' }, { status: 500 })
    }
  }

  return new Response('Webhook processed successfully', { status: 200 })
}
