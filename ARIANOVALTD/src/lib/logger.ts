import { writeClient } from '@/sanity/lib/write-client';

export type LogStatus = 'success' | 'failed' | 'pending';
export type LogService = 'cin7' | 'stripe' | 'system' | 'resend';
export type SyncState = 'SALE_CREATED' | 'PAYMENT_COMPLETED';

export interface TransactionLogPayload {
  orderNumber: string;
  service: LogService;
  status: LogStatus;
  syncState?: SyncState;
  stripeSessionId?: string;
  payload?: any;
  errorMessage?: string;
  amountTotal?: number; // Stripe amount_total in dollars (cents / 100) — used as source of truth in retry
}

/**
 * Unified Logger for Arianova
 * Handles both ephemeral system logging (Vercel/Axiom) and durable transactional state logging (Sanity).
 */
export class Logger {
  /**
   * System-level telemetry log (Vercel / Axiom)
   * Captures ephemeral data like performance and state transitions.
   */
  static info(message: string, context?: Record<string, unknown>) {
    // In production, this can be intercepted by Axiom or Datadog integrations automatically.
    console.log(`[INFO] ${message}`, context ? JSON.stringify(context) : '');
  }

  /**
   * System-level error log (Sentry / Vercel)
   * Captures unhandled exceptions or critical path failures.
   */
  static error(message: string, error?: any, context?: Record<string, unknown>) {
    // In production, trigger Sentry.captureException here.
    console.error(`[ERROR] ${message}`, error || '', context ? JSON.stringify(context) : '');
  }

  /**
   * Transactional state log (Sanity CMS)
   * A durable, auditable record for the Janitor Cron and customer service.
   * Creates or returns a pending log.
   */
  static async createTransactionLog(data: TransactionLogPayload): Promise<string> {
    try {
      const record = await writeClient.create({
        _type: 'integrationLog',
        orderNumber: data.orderNumber,
        service: data.service,
        status: data.status,
        syncState: data.syncState,
        stripeSessionId: data.stripeSessionId,
        payload: data.payload ? JSON.stringify(data.payload, null, 2) : undefined,
        errorMessage: data.errorMessage,
        retryCount: 0,
        amountTotal: data.amountTotal,
      });
      this.info(`Created Transaction Log (${data.status}) for Order: ${data.orderNumber}`);
      return record._id;
    } catch (err: any) {
      this.error(`Failed to create Sanity Transaction Log`, err, { orderNumber: data.orderNumber });
      // In a robust system, fallback to writing to disk or a queue. 
      // For now, throw so the caller knows the state was not durably recorded.
      throw err;
    }
  }

  /**
   * Updates an existing Transactional state log in Sanity.
   */
  static async updateTransactionLog(
    logId: string, 
    update: { status?: LogStatus; syncState?: SyncState; errorMessage?: string; incrementRetry?: boolean; payload?: any }
  ) {
    try {
      let patch = writeClient.patch(logId);
      
      if (update.status) patch = patch.set({ status: update.status });
      if (update.syncState) patch = patch.set({ syncState: update.syncState });
      if (update.errorMessage) patch = patch.set({ errorMessage: update.errorMessage });
      if (update.payload) patch = patch.set({ payload: JSON.stringify(update.payload, null, 2) });
      if (update.incrementRetry) patch = patch.inc({ retryCount: 1 });

      await patch.commit();
      this.info(`Updated Transaction Log [${logId}]`, update);
    } catch (err: any) {
      this.error(`Failed to update Sanity Transaction Log [${logId}]`, err);
    }
  }
}
