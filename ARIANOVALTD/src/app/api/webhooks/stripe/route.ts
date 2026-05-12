import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { client } from '@/sanity/lib/client'
import { createSalesOrder, Cin7OrderPayload } from '@/lib/cin7'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2023-10-16' as any,
})

export async function POST(req: Request) {
  const stripe = getStripe()
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') as string
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event: Stripe.Event

  try {
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is missing from .env.local')
    }
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed: ${err.message}`)
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 })
  }

  const writeClient = client.withConfig({ token: process.env.SANITY_WRITE_TOKEN })

  // --- 1. FINALIZED PAYMENTS (Deduct Physical and Release Soft Lock) ---
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const sessionId = session.id
    console.log(`\n✅ [Stripe Webhook] Verified successful checkout for session: ${sessionId}`)

    try {
      const idempotencyId = `processed-session-${sessionId}`
      
      // 1. IDEMPOTENCY CHECK (Safety Net Layer 1): 
      // We create a unique ID for this transaction so Sanity guarantees we only process this event ONCE. 
      // We check here first to skip heavy processing if it's already done (e.g. from retries).
      const existing = await client.fetch(`*[_id == $id][0]`, { id: idempotencyId })
      if (existing) {
        console.log(`⏭️ [Webhook] Skipping session ${sessionId} - Already processed.`)
        return NextResponse.json({ received: true, skipped: true })
      }

      // 2. METADATA SHORTCUT (Safety Net Layer 2):
      // Instead of querying Sanity for the full cart, we stringified the cart during Checkout.
      // This eliminates failure points and ensures we are mapping exactly what they checked out with.
      const serializedCart = session.metadata?.serializedCart
      if (!serializedCart) {
        throw new Error(`Missing serializedCart in metadata for session ${sessionId}`)
      }
      const cart = JSON.parse(serializedCart)

      // 3. ATOMIC TRANSACTION INITIALIZATION
      // All mutations below will occur at the EXACT same time. If one fails, they all fail.
      const tx = writeClient.transaction().create({
        _id: idempotencyId,
        _type: 'sessionRecord',
        sessionId,
        status: 'completed',
        processedAt: new Date().toISOString()
      })

      const clerkUserId = session.metadata?.clerkUserId
      const customerPrefix = (clerkUserId && clerkUserId !== 'guest') ? `customer-${clerkUserId}` : undefined
      
      const sanityOrderItems = []
      const emailItems = []

      for (const item of cart) {
        // 4. INVENTORY DEDUCTION & SALES TRACKING (Safety Net Layer 3)
        // Release the temporary lock, and increment total sales count.
        // Physical stock is now handled by Cin7 Webhooks.
        tx.patch(item.id, p => p.dec({
          committed_stock: item.qty 
        }).setIfMissing({
          sold_count: 0
        }).inc({
          sold_count: item.qty
        }))

        // Determine if it's a wine or an event for the Order Reference
        const isWine = item.type === 'wine';
        
        sanityOrderItems.push({
          _key: Math.random().toString(36).substring(7),
          _type: 'orderItem',
          wine: isWine ? { _type: 'reference', _ref: item.id } : undefined,
          event: !isWine ? { _type: 'reference', _ref: item.id } : undefined,
          quantity: item.qty,
          priceAtPurchase: item.price,
        })
        
        emailItems.push({
          title: item.title,
          quantity: item.qty,
          price: item.price,
        })
      }

      const orderNumber = sessionId.slice(-8).toUpperCase();
      tx.create({
        _type: 'order',
        orderNumber: orderNumber,
        stripeSessionId: sessionId,
        customer: customerPrefix ? { _type: 'reference', _ref: customerPrefix } : undefined,
        totalAmount: session.amount_total,
        status: 'Processing',
        items: sanityOrderItems,
      })

      await tx.commit()
      console.log(`🎉 [Success] Stripe checkout mapped natively to Inventory Logic!`)
      
      // --- 5. CIN7 / UNLEASHED INTEGRATION ---
      try {
        const cin7Payload: Cin7OrderPayload = {
          Customer: session.customer_details?.name || 'Arianova Customer',
          ShippingAddress: {
            Line1: session.customer_details?.address?.line1 || '',
            City: session.customer_details?.address?.city || '',
            Country: session.customer_details?.address?.country || '',
            Postcode: session.customer_details?.address?.postal_code || '',
          },
          StripeSessionId: sessionId,
          Lines: cart.map((item: any) => ({
            SKU: item.sku || item.id, // Fallback to Sanity ID if SKU isn't in cart yet
            Quantity: item.qty,
            Price: item.price / 100 // Stripe uses cents, Cin7 uses dollars
          }))
        };
        await createSalesOrder(cin7Payload);
        
        // Log SUCCESS to Sanity
        await writeClient.create({
          _type: 'integrationLog',
          orderNumber,
          service: 'cin7',
          status: 'success',
          payload: JSON.stringify(cin7Payload, null, 2),
        });

        console.log(`✅ [Success] Order dispatched to Cin7 Core!`);
      } catch (cin7Error: any) {
        console.error(`❌ [Error] Failed to push order ${sessionId} to Cin7:`, cin7Error);
        
        // Log FAILURE to Sanity
        await writeClient.create({
          _type: 'integrationLog',
          orderNumber,
          service: 'cin7',
          status: 'failed',
          errorMessage: cin7Error.message || 'Unknown Cin7 Error',
          payload: JSON.stringify(cart, null, 2), // Save the cart data so we can retry later
        });
      }
      
      // --- EMAIL NOTIFICATION LOGIC ---
      if (process.env.ENABLE_EMAILS === 'true') {
        try {
          const { Resend } = await import('resend');
          // @ts-ignore
          const ReceiptEmail = (await import('@/emails/ReceiptEmail')).default;
          const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');
          const email = session.customer_details?.email;
          if (email) {
            await resend.emails.send({
              from: 'Arianova Estate <onboarding@resend.dev>',
              to: email,
              subject: `Your Arianova Allocation - Order #${orderNumber}`,
              react: ReceiptEmail({
                orderNumber,
                customerName: session.customer_details?.name || 'Valued Collector',
                totalAmount: session.amount_total || 0,
                sessionId: sessionId,
                items: emailItems,
                appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
              })
            });
          }

          // Log Email Success
          await writeClient.create({
            _type: 'integrationLog',
            orderNumber,
            service: 'resend',
            status: 'success',
          });
        } catch (emailErr: any) {
          console.error(`❌ [Email Error] Resend Engine Failed:`, emailErr);
          
          // Log Email Failure
          await writeClient.create({
            _type: 'integrationLog',
            orderNumber,
            service: 'resend',
            status: 'failed',
            errorMessage: emailErr.message || 'Email engine failed',
          });
        }
      }
    } catch (error: any) {
      console.error('❌ [Error] Failed to mutate Sanity backend on Completion:', error)
      return new NextResponse(`Sanity Webhook Engine Failed: ${error.message}`, { status: 500 })
    }
  }

  // --- 2. ABANDONED CARTS (Release Soft Lock Only) ---
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session
    const sessionId = session.id
    console.log(`\n⏳ [Stripe Webhook] Session Expired: ${sessionId}. Reverting locks safely...`)

    try {
      const idempotencyId = `processed-session-${sessionId}`
      const existing = await client.fetch(`*[_id == $id][0]`, { id: idempotencyId })
      if (existing) {
        console.log(`⏭️ [Webhook] Skipping session expiry ${sessionId} - Already processed.`)
        return NextResponse.json({ received: true, skipped: true })
      }

      // METADATA SHORTCUT
      const serializedCart = session.metadata?.serializedCart
      if (!serializedCart) {
        console.warn(`[Webhook] No serializedCart found for expired session ${sessionId}. Standard cleanup skipped.`);
        return NextResponse.json({ received: true });
      }
      const cart = JSON.parse(serializedCart)

      const tx = writeClient.transaction().create({
        _id: idempotencyId,
        _type: 'sessionRecord',
        sessionId,
        status: 'expired',
        processedAt: new Date().toISOString()
      })

      for (const item of cart) {
        // Here we ONLY release the committed stock lock, to free it back into the wild for other users.
        tx.patch(item.id, p => p.dec({ committed_stock: item.qty }))
      }
      
      await tx.commit()
      console.log(`✅ [Success] Abandoned Locks Released natively!`)
    } catch (error: any) {
      if (error.statusCode === 409) {
        return NextResponse.json({ received: true, skipped: true })
      }
      console.error('❌ [Error] Failed to release inventory bounds on abandon:', error)
      return new NextResponse('Sanity Webhook Engine Failed', { status: 500 })
    }
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
