import { NextResponse } from 'next/server';
import { writeClient } from '@/sanity/lib/write-client';
import { createSalesOrder, createSalesPayment, checkSalesOrderExists, Cin7SalePayload, Cin7PaymentPayload } from '@/lib/cin7';
import { Logger, SyncState } from '@/lib/logger';

// Strict Type Safety for Sanity Log
interface SanityIntegrationLog {
  _id: string;
  orderNumber: string;
  service: string;
  status: 'success' | 'failed' | 'pending';
  syncState?: SyncState;
  errorMessage?: string;
  payload?: string;
  stripeSessionId?: string;
  retryCount: number;
  amountTotal?: number; // Stripe source-of-truth amount in dollars
}

export async function GET(req: Request) {
  try {
    // 1. Security: Protect the Cron Route
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const MAX_RETRIES = 5;
    const timeoutThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // 2. Fetch failed OR orphaned pending Cin7 logs
    const failedLogs: SanityIntegrationLog[] = await writeClient.fetch(
      `*[_type == "integrationLog" && service == "cin7" && (status == "failed" || (status == "pending" && _createdAt < $timeoutThreshold)) && (retryCount == null || retryCount < $maxRetries)] {
        _id,
        orderNumber,
        service,
        status,
        syncState,
        errorMessage,
        payload,
        stripeSessionId,
        amountTotal,
        "retryCount": coalesce(retryCount, 0)
      }`,
      { maxRetries: MAX_RETRIES, timeoutThreshold }
    );

    if (failedLogs.length === 0) {
      return NextResponse.json({ message: 'No failed logs found to retry.' }, { status: 200 });
    }

    Logger.info(`🧹 [Janitor Cron] Found ${failedLogs.length} failed Cin7 orders. Beginning replay...`);

    const results = [];

    // 3. Replay Loop
    for (const log of failedLogs) {
      try {
        if (!log.payload) {
          throw new Error('Payload is empty. Cannot replay.');
        }

        // We use stripe_session_id as the correlation/idempotency key for ERP.
        // If Cin7 receives an order with an existing stripe_session_id, it should reject or update it natively.
        // This prevents double-creation in the ERP if the timeout happened AFTER Cin7 created it, 
        // but BEFORE our Vercel function got the 200 OK.
        // Fix #5: Validate the deserialized payload before sending to external API
        const orderPayload: Cin7SalePayload = JSON.parse(log.payload);
        if (!orderPayload.CustomerID || !orderPayload.Order?.Lines?.length) {
          throw new Error(`Malformed payload for order ${log.orderNumber}: missing CustomerID or Order Lines.`);
        }

        Logger.info(`[Janitor] Retrying Order: ${log.orderNumber} (Attempt ${log.retryCount + 1})`);

        if (log.stripeSessionId) {
          // Pre-Flight Check: Does this order already exist in Cin7?
          const existingOrder = await checkSalesOrderExists(log.stripeSessionId);

          if (existingOrder) {
            Logger.info(`[Janitor] Order ${log.orderNumber} already exists in Cin7 (SaleID: ${existingOrder.SaleID}).`);

            if (log.syncState !== 'PAYMENT_COMPLETED') {
              // We need to complete the payment
              Logger.info(`[Janitor] Order exists but payment is incomplete. Executing Step 2: Payment.`);
              const paymentPayload: Cin7PaymentPayload = {
                TaskID: existingOrder.SaleID,
                // Fix #6: Use Stripe's stored amountTotal as the source of truth
                Amount: log.amountTotal ?? orderPayload.Order?.Lines.reduce((sum, line) => sum + (line.Price * line.Quantity), 0) ?? 0,
                DatePaid: new Date().toISOString().split('.')[0],
                Account: 'Stripe Clearing Account'
              };
              await createSalesPayment(paymentPayload);
              await Logger.updateTransactionLog(log._id, {
                status: 'success',
                syncState: 'PAYMENT_COMPLETED',
                errorMessage: 'Recovered via pre-flight check (payment applied).'
              });
              results.push({ order: log.orderNumber, status: 'recovered_payment' });
              continue;
            } else {
              // Already fully complete
              await Logger.updateTransactionLog(log._id, {
                status: 'success',
                errorMessage: 'Recovered via pre-flight check (already existed and paid).'
              });
              results.push({ order: log.orderNumber, status: 'recovered_duplicate' });
              continue;
            }
          }
        }

        // Execute Step 1: Create Sale
        const saleResponse = await createSalesOrder(orderPayload);
        const saleId = saleResponse.ID;

        await Logger.updateTransactionLog(log._id, { syncState: 'SALE_CREATED' });

        // Execute Step 2: Create Payment
        if (saleId) {
          const paymentPayload: Cin7PaymentPayload = {
            TaskID: saleId,
            // Fix #6: Use Stripe's stored amountTotal as the source of truth
            Amount: log.amountTotal ??
              ((orderPayload.Order?.Lines.reduce((sum, line) => sum + (line.Price * line.Quantity), 0) || 0) +
                (orderPayload.Order?.AdditionalCharges?.reduce((sum, charge) => sum + charge.Price, 0) || 0)),
            DatePaid: new Date().toISOString().split('.')[0],
            Account: 'Stripe Clearing Account'
          };
          await createSalesPayment(paymentPayload);
        }

        // Update Sanity on Success
        await Logger.updateTransactionLog(log._id, { status: 'success', syncState: 'PAYMENT_COMPLETED' });

        results.push({ order: log.orderNumber, status: 'recovered' });
        Logger.info(`✅ [Janitor] Recovered Order: ${log.orderNumber}`);

      } catch (error: any) {
        Logger.error(`❌ [Janitor] Failed to recover Order: ${log.orderNumber}`, error);

        // Update Sanity on Failure (increment retryCount)
        await Logger.updateTransactionLog(log._id, {
          incrementRetry: true,
          errorMessage: `Retry ${log.retryCount + 1} Failed: ${error.message}`
        });

        results.push({ order: log.orderNumber, status: 'failed', retryCount: log.retryCount + 1 });
      }
    }

    return NextResponse.json({ message: 'Janitor run complete', results }, { status: 200 });

  } catch (error: any) {
    // Fix #2: Never leak internal error details to the HTTP response
    Logger.error('🧹 [Janitor Cron] Critical failure', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
