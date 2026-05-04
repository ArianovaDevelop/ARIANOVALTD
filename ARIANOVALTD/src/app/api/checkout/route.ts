import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'
import { client } from '@/sanity/lib/client'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: '2023-10-16' as any,
})

// Helper for exponential backoff retries on Sanity transactions
async function commitWithRetry(tx: any, maxRetries = 3, initialDelay = 100) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await tx.commit();
    } catch (err: any) {
      attempt++;
      // 409 Conflict = Revision Mismatch / Optimistic Locking Failure
      if (err.statusCode === 409 && attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`[Sanity] 409 Conflict detected. Retrying attempt ${attempt} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

export async function POST(req: Request) {
  try {
    const { items } = await req.json()
    const { userId } = await auth()

    if (!items || items.length === 0) {
      return new NextResponse('Cart is empty', { status: 400 })
    }

    const writeClient = client.withConfig({ token: process.env.SANITY_WRITE_TOKEN })

    // 1. Fetch current authentic stock & price for all items (inc. _rev for optimistic locking)
    // Support both wines and events for shared checkout logic
    const wineIds = items.map((item: any) => item.id)
    const winesInDb = await writeClient.fetch(
      `*[_type in ["wine", "event"] && _id in $wineIds] { _id, physical_stock, committed_stock, price, title, _rev }`, 
      { wineIds }
    )

    // 2. Map and Verify Stock Mathematically 
    const tx = writeClient.transaction()
    const verifiedItems = []

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
      
      // Stage the increment mutation with Optimistic Locking (_rev check)
      tx.patch(item.id, { 
        ifRevisionID: dbWine._rev,
        inc: { committed_stock: item.quantity } 
      })

      // Store verified price for Stripe line items
      verifiedItems.push({
        ...item,
        price: dbWine.price // SECURITY: Use authoritative price from Sanity
      })
    }

    // 3. Commit the soft lock transaction with Retry Logic
    try {
      await commitWithRetry(tx)
    } catch (err: any) {
      console.error('Failed to commit inventory soft lock after retries:', err)
      return NextResponse.json({ 
        error: 'High traffic detected. We were unable to secure your allocation. Please try again in a moment.' 
      }, { status: 409 })
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
        id: i._id,
        type: i._type,
        qty: i.quantity,
        title: i.title,
        price: i.price
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
        // Force the checkout portal to expire in 30 minutes to minimize "Ghost Lock" duration
        expires_at: Math.floor(Date.now() / 1000) + (30 * 60)
      })
    } catch (stripeErr) {
      console.error('Stripe Session Failed, Reverting Soft Locks...');
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
    console.error('Stripe Checkout Route Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
