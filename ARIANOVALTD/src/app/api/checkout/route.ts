import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'
import crypto from 'crypto'
import { client } from '@/sanity/lib/client'
import { Logger } from '@/lib/logger'
import { getAppUrl } from '@/lib/urls'
import { getLiveCin7Stock } from '@/lib/cin7'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: '2023-10-16' as any,
})

// The commitWithRetry helper was removed as it inherently reused stale _rev payloads on 409s.

export async function POST(req: Request) {
  try {
    const { items } = await req.json()
    const { userId } = await auth()

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new NextResponse('Cart is empty', { status: 400 })
    }

    // ============================================================================
    // SECURITY: INPUT VALIDATION & AGGREGATION
    // ============================================================================
    // We must merge items by ID. Otherwise, a malicious actor could pass the same 
    // ID 5 times with a quantity of 1. The availability loop would check 1 against 
    // the static stock 5 times, passing the check, but ultimately decrementing 
    // 5 units, allowing them to bypass physical inventory limits.
    const mergedItemsMap = new Map();
    for (const item of items) {
      if (!item.id || typeof item.id !== 'string') {
        return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return NextResponse.json({ error: 'Quantity must be a positive integer' }, { status: 400 });
      }
      if (mergedItemsMap.has(item.id)) {
        mergedItemsMap.get(item.id).quantity += item.quantity;
      } else {
        mergedItemsMap.set(item.id, { ...item });
      }
    }
    const safeItems = Array.from(mergedItemsMap.values());

    const writeClient = client.withConfig({ token: process.env.SANITY_WRITE_TOKEN })
    const wineIds = safeItems.map((item: any) => item.id)

    // ============================================================================
    // STEP 1: INITIAL SANITY DATA FETCH
    // ============================================================================
    // We NEVER trust the price or stock quantities passed from the client's browser.
    // We only trust the IDs. First, we fetch the SKUs from Sanity to perform a live check.
    const initialProducts = await writeClient.fetch(
      `*[_type in ["wine", "event"] && _id in $wineIds] { _id, sku, title, _type }`,
      { wineIds }
    )

    let backendWineQuantity = 0;
    let backendHasWine = false;
    for (const item of safeItems) {
      const dbProduct = initialProducts.find((p: any) => p._id === item.id);
      if (dbProduct && dbProduct._type === 'wine') {
        backendHasWine = true;
        backendWineQuantity += item.quantity;
      }
    }

    if (backendHasWine && backendWineQuantity < 6) {
      return NextResponse.json({ error: 'A minimum of 6 bottles is required for wine orders.' }, { status: 400 })
    }

    // ============================================================================
    // STEP 2: AUTHORITATIVE LIVE STOCK FETCH (CIN7)
    // ============================================================================
    // We hit the ERP directly to get the absolute truth of physical stock (StockOnHand).
    // This happens outside the mutation loop to prevent rate-limiting the ERP.
    let liveCin7Stock: Record<string, number> = {}
    try {
      const skus = initialProducts.map((p: any) => p.sku).filter(Boolean)
      liveCin7Stock = await getLiveCin7Stock(skus)
    } catch (cin7Err) {
      Logger.error('Cin7 Live Stock Verification Failed', cin7Err);
      return NextResponse.json({ 
        error: 'Unable to verify live warehouse inventory. Please try again in a moment.' 
      }, { status: 503 })
    }

    let attempt = 0;
    const maxRetries = 3;
    let verifiedItems: any[] = [];
    
    // ============================================================================
    // STEP 3: "GHOST INVENTORY" SOFT LOCKING (OPTIMISTIC CONCURRENCY)
    // ============================================================================
    // If multiple people try to buy the last bottle at the exact same millisecond,
    // Sanity might throw a 409 Conflict. This loop catches that, re-fetches the latest
    // state (the `_rev` ID), and tries again up to 3 times.
    while (attempt < maxRetries) {
      try {
        const winesInDb = await writeClient.fetch(
          `*[_type in ["wine", "event"] && _id in $wineIds] { _id, _type, committed_stock, price, title, sku, _rev }`,
          { wineIds }
        )
        const tx = writeClient.transaction()
        verifiedItems = []

        for (const item of safeItems) {
          const dbWine = winesInDb.find((w: any) => w._id === item.id)
          if (!dbWine) {
            return NextResponse.json({ error: `Invalid product: ${item.title}` }, { status: 400 })
          }
          
          // --- THE INVENTORY MATH ---
          // 1. physicalStock: The actual bottles on the shelf in Cin7 right now.
          // 2. dbWine.committed_stock: Bottles currently sitting in other people's 
          //    active checkout sessions (Ghost Inventory).
          // 3. available: The true remaining stock we are allowed to sell.
          const physicalStock = liveCin7Stock[dbWine.sku] || 0
          const available = physicalStock - (dbWine.committed_stock || 0)
          
          if (available < item.quantity) {
            return NextResponse.json({ 
              error: `Insufficient stock for ${item.title}. Only ${Math.max(0, available)} available.` 
            }, { status: 400 })
          }
          
          // --- THE SOFT LOCK MUTATION ---
          // We increment `committed_stock` to reserve these bottles for THIS session.
          // We use `ifRevisionID` to guarantee that nobody else changed this document
          // in the millisecond between our fetch and our patch. 
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

    // ============================================================================
    // STEP 4: STRIPE LINE ITEM GENERATION
    // ============================================================================
    // We construct the Stripe payment payload using the verified, authoritative
    // prices we pulled directly from the Sanity database, ensuring no tampering.
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

    // ============================================================================
    // STEP 5: STRIPE CHECKOUT SESSION INITIALIZATION
    // ============================================================================
    let session;
    try {
      const serializedCart = JSON.stringify(verifiedItems.map(i => ({
        id: i.id,
        type: i.type,
        qty: i.quantity,
        title: i.title,
        price: i.price,
        sku: i.sku,
      })));

      const origin = req.headers.get('origin') || getAppUrl();
      const orderNumber = crypto.randomBytes(4).toString('hex').toUpperCase();

      // ============================================================================
      // FIX: STRIPE METADATA CHUNKING
      // ============================================================================
      // Stripe restricts metadata values to 500 characters. If a cart has multiple 
      // unique items, the serialized string will crash the checkout. We safely chunk it.
      const metadataPayload: Record<string, string> = {
        orderNumber,
        clerkUserId: userId || 'guest',
      };
      
      const chunks = serializedCart.match(/.{1,500}/g) || [];
      chunks.forEach((chunk, idx) => {
        metadataPayload[`cart_chunk_${idx}`] = chunk;
      });

      const sessionOptions: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/cart`,
        metadata: metadataPayload,
        payment_intent_data: {
          metadata: {
            // Injecting the Order Number here guarantees it shows up beautifully in the 
            // Stripe Dashboard "Metadata" UI card for the accountant to read.
            orderNumber,
          }
        },
        shipping_address_collection: {
          allowed_countries: ['NZ', 'AU'], // Restrict to your shipping zones
        },
        billing_address_collection: 'required',
        // --- SESSION EXPIRATION & GHOST LOCK RELEASE ---
        // We force the checkout portal to expire in 30 minutes. If the user abandons
        // the cart, the Stripe Webhook will fire an `expired` event, allowing us to
        // release the `committed_stock` back to the public pool.
        expires_at: Math.floor(Date.now() / 1000) + (30 * 60)
      };

      const hasWine = verifiedItems.some((item: any) => item.type === 'wine');
      if (hasWine) {
        sessionOptions.custom_fields = [
          {
            key: 'age_verification',
            label: {
              type: 'custom',
              custom: 'Age Verification',
            },
            type: 'dropdown',
            dropdown: {
              options: [
                {
                  label: 'I confirm I am 18+ years old',
                  value: '18plus',
                },
              ],
            },
          },
        ];
      }

      session = await stripe.checkout.sessions.create(sessionOptions)
    } catch (stripeErr) {
      Logger.error('Stripe Session Failed, Reverting Soft Locks', stripeErr);
      // ============================================================================
      // ROLLBACK: STRIPE INITIALIZATION FAILURE
      // ============================================================================
      // If Stripe is down or throws an error, we immediately rollback the soft locks
      // we just created in Sanity so we don't accidentally hold stock hostage permanently.
      const revertTx = writeClient.transaction()
      for (const item of safeItems) {
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
