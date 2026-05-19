import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { client } from '@/sanity/lib/client'
import { writeClient } from '@/sanity/lib/write-client'
import { createSalesOrder, createSalesPayment, createSalesInvoice, authoriseSalesOrder, Cin7SalePayload, Cin7PaymentPayload } from '@/lib/cin7'
import { Logger } from '@/lib/logger'
import { getAppUrl } from '@/lib/urls'

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

  // Fix #7: use singleton writeClient, not client.withConfig per request

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
        if (!item.id) {
          Logger.error(`[Webhook] Skipping item with missing ID in cart`, { item });
          continue;
        }

        tx.patch(item.id, p => p.setIfMissing({ 
          committed_stock: 0,
          sold_count: 0
        }).dec({
          committed_stock: item.qty 
        }).inc({
          sold_count: item.qty
        }))

        // Determine if it's a wine or an event for the Order Reference
        const isWine = item.type === 'wine';
        const cleanRefId = item.id.replace('drafts.', '');
        
        const orderItem: any = {
          _key: Math.random().toString(36).substring(7),
          _type: 'orderItem',
          quantity: item.qty,
          priceAtPurchase: item.price,
        };

        if (isWine) {
          orderItem.wine = { _type: 'reference', _ref: cleanRefId };
        } else {
          orderItem.event = { _type: 'reference', _ref: cleanRefId };
        }
        
        sanityOrderItems.push(orderItem)
        
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
      Logger.info(`🎉 [Success] Stripe checkout mapped natively to Inventory Logic!`, { sessionId })
      
      // --- 5. CIN7 / UNLEASHED INTEGRATION ---
      let integrationLogId = '';
      try {
        const shippingCost = (session.shipping_cost?.amount_total || 0) / 100;
        const additionalCharges = [];
        if (shippingCost > 0) {
          additionalCharges.push({
            Description: 'Shipping',
            Price: shippingCost,
            Quantity: 1,
            TaxRule: 'Tax on Sales'
          });
        }

        const cin7Payload: Cin7SalePayload = {
          CustomerID: process.env.CIN7_DEFAULT_CUSTOMER_ID || '00000000-0000-0000-0000-000000000000',
          Customer: session.customer_details?.name || 'Arianova Customer',
          ShippingAddress: {
            Line1: session.customer_details?.address?.line1 || 'Address Not Provided',
            City: session.customer_details?.address?.city || 'City Not Provided',
            Country: session.customer_details?.address?.country || 'NZ',
            Postcode: session.customer_details?.address?.postal_code || '0000',
          },
          CustomerReference: sessionId, // Our idempotency/correlation key
          Location: process.env.CIN7_DEFAULT_LOCATION || 'Main Warehouse',
          SaleType: 'Simple',
          Order: {
            Status: 'AUTHORISED',
            Lines: cart.map((item: any) => ({
              SKU: item.sku ?? (() => {
                Logger.error(`[Cin7] Missing SKU for cart item — falling back to Sanity ID. Check checkout serialization.`, { itemId: item.id, title: item.title });
                return item.id;
              })(),
              Name: item.name || 'Arianova Product', // Schema validation safety
              Quantity: item.qty,
              Price: item.price / 100,
              Total: (item.price / 100) * item.qty, // Explicit total to satisfy Cin7 validation
              TaxRule: 'Tax on Sales',
            })),
            AdditionalCharges: additionalCharges.length > 0 ? additionalCharges : undefined
          }
        };

        // 1. Create Pending Log BEFORE API call (protects against Vercel SIGKILL timeouts)
        integrationLogId = await Logger.createTransactionLog({
          orderNumber,
          service: 'cin7',
          status: 'pending',
          payload: cin7Payload,
          stripeSessionId: sessionId,
          // Fix #6: Store Stripe's amount as source of truth for the retry cron
          amountTotal: (session.amount_total || 0) / 100,
        });

        // 2. Execute Step 1: Create Sale
        const saleResponse = await createSalesOrder(cin7Payload);
        const saleId = saleResponse.ID; // Cin7 returns the new Sale ID
        
        // 3. Update to intermediate state
        await Logger.updateTransactionLog(integrationLogId, { syncState: 'SALE_CREATED' });
        Logger.info(`[Step 1] Order created in Cin7 Core!`, { orderNumber, saleId });

        // 4. NEW STEP A: Authorise Order
        if (saleId) {
          await authoriseSalesOrder(saleId, cin7Payload.Order?.Lines);
          await Logger.updateTransactionLog(integrationLogId, { syncState: 'ORDER_AUTHORISED' });
          Logger.info(`[Step 2] Order authorised in Cin7 Core!`, { orderNumber });
        }

        // 4. NEW STEP B: Authorise Invoice (Required for Payment)
        if (saleId) {
          await createSalesInvoice(saleId, cin7Payload.Order?.Lines);
          await Logger.updateTransactionLog(integrationLogId, { syncState: 'INVOICE_AUTHORISED' });
          Logger.info(`[Step 2] Invoice authorised in Cin7 Core!`, { orderNumber });
        }

        // 5. Execute Step 3: Create Payment
        if (saleId) {
          // Resolve the clearing account from env — fall back gracefully with a warning
          const stripeAccount = process.env.CIN7_STRIPE_ACCOUNT_NAME;
          if (!stripeAccount) {
            Logger.warn(`[Cin7] CIN7_STRIPE_ACCOUNT_NAME is not set. Falling back to default account "1201". Set this env var to map Stripe payments to the correct Xero clearing account.`);
          }
          const paymentPayload: Cin7PaymentPayload = {
            TaskID: saleId,
            Reference: session.id,                              // Stripe session ID for audit trail
            Amount: (session.amount_total || 0) / 100,          // Gross amount — no fee deductions
            DatePaid: new Date(session.created * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'), // Actual Stripe payment timestamp — strips ms, preserves Z UTC indicator
            Account: stripeAccount ?? '1201',                   // Xero clearing account
            CurrencyRate: 1
          };
          await createSalesPayment(paymentPayload);
        }

        // 5. Update to final success
        await Logger.updateTransactionLog(integrationLogId, { status: 'success', syncState: 'PAYMENT_COMPLETED' });
        Logger.info(`✅ [Success] Two-Step Sync completed for Cin7 Core!`, { orderNumber });

        // 🎉 Notify Slack of Successful Sale
        await Logger.notifySlack(
          `🍷 *New Sale!* Order #${orderNumber} has been successfully synchronized to Cin7.`,
          {
            orderNumber,
            customer: session.customer_details?.name || 'Arianova Customer',
            amount: `$${((session.amount_total || 0) / 100).toFixed(2)}`,
            items: cart.map((i: any) => `${i.qty}x ${i.title}`).join(', ')
          }
        );
      } catch (cin7Error: any) {
        Logger.error(`❌ [Error] Failed to push order ${sessionId} to Cin7`, cin7Error);
        
        // 4. Update to failure
        if (integrationLogId) {
          await Logger.updateTransactionLog(integrationLogId, { 
            status: 'failed',
            errorMessage: cin7Error.message || 'Unknown Cin7 Error'
          });
        } else {
          // Absolute fallback
          await Logger.createTransactionLog({
            orderNumber,
            service: 'cin7',
            status: 'failed',
            errorMessage: cin7Error.message || 'Failed to create pending log & Cin7 Error',
            stripeSessionId: sessionId,
          });
        }
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
                appUrl: getAppUrl()
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
      // Fix #2: Never leak internal error.message to the HTTP response
      console.error('❌ [Error] Failed to mutate Sanity backend on Completion:', error)
      return new NextResponse('Internal Server Error', { status: 500 })
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
