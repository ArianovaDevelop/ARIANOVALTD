import { NextResponse } from 'next/server';
import { writeClient } from '@/sanity/lib/write-client';
import { createSalesOrder, createSalesPayment, createSalesInvoice, authoriseSalesOrder, checkSalesOrderExists, Cin7SalePayload, Cin7PaymentPayload } from '@/lib/cin7';
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

        // Fix: Explicitly set Line Totals to satisfy Cin7 validation
        orderPayload.Order.Lines = orderPayload.Order.Lines.map((line: any) => ({
          ...line,
          Total: line.Total || (line.Price * line.Quantity)
        }));

        Logger.info(`[Janitor] Retrying Order: ${log.orderNumber} (Attempt ${log.retryCount + 1})`);

        let currentSaleId = null;

        // 1. Resolve SaleID (Pre-Flight or Existing State)
        if (log.stripeSessionId) {
          const existingOrder = await checkSalesOrderExists(log.stripeSessionId);
          if (existingOrder) {
            currentSaleId = existingOrder.SaleID;
            Logger.info(`[Janitor] Pre-flight found existing SaleID: ${currentSaleId}`);
          }
        }

        // 2. State Machine: Step 1 - Create Sale
        if (!currentSaleId && !log.syncState) {
          const saleResponse = await createSalesOrder(orderPayload);
          currentSaleId = saleResponse.ID;
          await Logger.updateTransactionLog(log._id, { syncState: 'SALE_CREATED' });
          log.syncState = 'SALE_CREATED'; // Update local state for subsequent blocks
        }

        if (!currentSaleId) {
          throw new Error(`Failed to resolve SaleID for order ${log.orderNumber}`);
        }

        // 3. State Machine: Step 2 - Authorise Order
        if (!log.syncState || log.syncState === 'SALE_CREATED') {
          await authoriseSalesOrder(currentSaleId, orderPayload.Order?.Lines);
          await Logger.updateTransactionLog(log._id, { syncState: 'ORDER_AUTHORISED' });
          log.syncState = 'ORDER_AUTHORISED';
        }

        // 4. State Machine: Step 3 - Authorise Invoice
        if (log.syncState === 'ORDER_AUTHORISED') {
          await createSalesInvoice(currentSaleId, orderPayload.Order?.Lines);
          await Logger.updateTransactionLog(log._id, { syncState: 'INVOICE_AUTHORISED' });
          log.syncState = 'INVOICE_AUTHORISED';
        }

        // 5. State Machine: Step 4 - Create Payment
        if (log.syncState === 'INVOICE_AUTHORISED') {
          const paymentPayload: Cin7PaymentPayload = {
            TaskID: currentSaleId,
            Amount: log.amountTotal ?? (
              (orderPayload.Order?.Lines.reduce((sum, line) => sum + (line.Price * line.Quantity), 0) || 0) +
              (orderPayload.Order?.AdditionalCharges?.reduce((sum, charge) => sum + (charge.Price * charge.Quantity), 0) || 0)
            ),
            DatePaid: new Date().toISOString().split('.')[0],
            Account: '1199',
            CurrencyRate: 1
          };
          await createSalesPayment(paymentPayload);
          await Logger.updateTransactionLog(log._id, { status: 'success', syncState: 'PAYMENT_COMPLETED' });
          log.syncState = 'PAYMENT_COMPLETED';
        }

        // 6. Final Status Sync: Ensure Sanity matches the completion state
        if (log.syncState === 'PAYMENT_COMPLETED') {
          await Logger.updateTransactionLog(log._id, { status: 'success' });
          results.push({ order: log.orderNumber, status: 'recovered' });
        }
        Logger.info(`✅ [Janitor] Recovered Order: ${log.orderNumber}`);

      } catch (error: any) {
        Logger.error(`❌ [Janitor] Failed to recover Order: ${log.orderNumber}`, error);

        const newRetryCount = (log.retryCount || 0) + 1;

        // Update Sanity on Failure (increment retryCount)
        await Logger.updateTransactionLog(log._id, {
          incrementRetry: true,
          errorMessage: `Retry ${newRetryCount} Failed: ${error.message}`
        });

        // Slack Alert on Permanent Failure
        if (newRetryCount >= MAX_RETRIES) {
          try {
            await Logger.notifySlack(
              `🚨 *Arianova Alert:* Janitor Cron failed to recover Order ${log.orderNumber} after ${MAX_RETRIES} attempts. Manual Cin7 intervention required.`,
              {
                orderNumber: log.orderNumber,
                lastError: error.message,
                syncState: log.syncState,
                stripeSessionId: log.stripeSessionId
              }
            );
          } catch (slackErr) {
            Logger.warn(`[Janitor] Slack notification failed for Order ${log.orderNumber}. Continuing.`);
          }
        }

        results.push({ order: log.orderNumber, status: 'failed', retryCount: newRetryCount });
      }
    }

    return NextResponse.json({ message: 'Janitor run complete', results }, { status: 200 });

  } catch (error: any) {
    // Fix #2: Never leak internal error details to the HTTP response
    Logger.error('🧹 [Janitor Cron] Critical failure', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
