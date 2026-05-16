import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'
import { client } from '@/sanity/lib/client'
import { Logger } from '@/lib/logger'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: '2023-10-16' as any,
})

// The commitWithRetry helper was removed as it inherently reused stale _rev payloads on 409s.

export async function POST(req: Request) {
  try {
    const { items } = await req.json()
    const { userId } = await auth()

    if (!items || items.length === 0) {
      return new NextResponse('Cart is empty', { status: 400 })
    }

    const writeClient = client.withConfig({ token: process.env.SANITY_WRITE_TOKEN })

    let attempt = 0;
    const maxRetries = 3;
    let verifiedItems: any[] = [];
    
    // 1. Optimistic Locking Retry Loop (Fetch -> Validate -> Patch)
    while (attempt < maxRetries) {
      try {
        const wineIds = items.map((item: any) => item.id)
        const winesInDb = await writeClient.fetch(
          `*[_type in ["wine", "event"] && _id in $wineIds] { _id, _type, physical_stock, committed_stock, price, title, sku, _rev }`,
          { wineIds }
        )
        const tx = writeClient.transaction()
        verifiedItems = []

        for (const item of items) {
          const dbWine = winesInDb.find((w: any) => w._id === item.id)
          if (!dbWine) {
            return NextResponse.json({ error: `Invalid product: ${item.title}` }, { status: 400 })
          }
          
          const available = (dbWine.physical_stock || 0) - (dbWine.committed_stock || 0)
          if (available < item.quantity) {
            return NextResponse.json({ 
              error: `Insufficient stock for ${item.title}. Only ${Math.max(0, available)} available.` 
            }, { status: 400 })
          }
          
          tx.patch(item.id, { 
            ifRevisionID: dbWine._rev,
            setIfMissing: { committed_stock: 0 },
            inc: { committed_stock: item.quantity } 
          })

          verifiedItems.push({
            ...item,
            id: dbWine._id,      // Ensure real Sanity ID is captured
            type: dbWine._type,  // Ensure real type is captured
            sku: dbWine.sku,     // Ensure real SKU is captured
            price: dbWine.price  // SECURITY: Use authoritative price from Sanity
          })
        }

        await tx.commit();
        break; // Successfully locked, exit the retry loop
      } catch (err: any) {
        attempt++;
        if (err.statusCode === 409 && attempt < maxRetries) {
          const delay = 100 * Math.pow(2, attempt);
          Logger.info(`[Sanity] 409 Conflict detected. Re-fetching _rev & stock (attempt ${attempt}) in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        Logger.error('Failed to commit inventory soft lock after retries', err);
        return NextResponse.json({ 
          error: 'High traffic detected. We were unable to secure your allocation. Please try again in a moment.' 
        }, { status: 409 })
      }
    }

    // 4. Build Stripe line items using AUTHORITATIVE prices
    const lineItems = verifiedItems.map((item: any) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.title,
          images: item.imageUrl ? [item.imageUrl] : [],
          metadata: { wine_id: item.id }
        },
        unit_amount: item.price, // SECURITY: Verified server-side
      },
      quantity: item.quantity,
    }))

    // 5. Secure Stripe Sessions Gateway 
    let session;
    try {
      const serializedCart = JSON.stringify(verifiedItems.map(i => ({
        id: i.id,
        type: i.type,
        qty: i.qty,
        title: i.title,
        price: i.price,
        sku: i.sku,
      })));

      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cart`,
        metadata: {
          clerkUserId: userId || 'guest',
          serializedCart, // Metadata Shortcut
        },
        shipping_address_collection: {
          allowed_countries: ['NZ', 'AU'], // Restrict to your shipping zones
        },
        billing_address_collection: 'required',
        // Force the checkout portal to expire in 30 minutes to minimize "Ghost Lock" duration
        expires_at: Math.floor(Date.now() / 1000) + (30 * 60)
      })
    } catch (stripeErr) {
      Logger.error('Stripe Session Failed, Reverting Soft Locks', stripeErr);
      // Revert the Sanity locks since Stripe couldn't secure the payment route
      const revertTx = writeClient.transaction()
      for (const item of items) {
        revertTx.patch(item.id, p => p.dec({ committed_stock: item.quantity }))
      }
      await revertTx.commit()
      
      return NextResponse.json({ error: 'Payment gateway failed to initialize.' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    Logger.error('Stripe Checkout Route Error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
