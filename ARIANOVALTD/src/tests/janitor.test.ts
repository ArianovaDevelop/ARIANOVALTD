import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/cron/cin7-retry/route';
import { writeClient } from '@/sanity/lib/write-client';
import { createSalesOrder, createSalesPayment, createSalesInvoice, authoriseSalesOrder, checkSalesOrderExists } from '@/lib/cin7';
import { Logger } from '@/lib/logger';

// 1. Mock Sanity Write Client
const mPatch = {
  set: vi.fn().mockReturnThis(),
  inc: vi.fn().mockReturnThis(),
  commit: vi.fn().mockResolvedValue({ success: true }),
};

vi.mock('@/sanity/lib/write-client', () => ({
  writeClient: {
    fetch: vi.fn(),
    patch: vi.fn(() => mPatch),
  },
}));

// 2. Mock Cin7 Library
vi.mock('@/lib/cin7', () => ({
  createSalesOrder: vi.fn(),
  createSalesPayment: vi.fn(),
  createSalesInvoice: vi.fn(),
  authoriseSalesOrder: vi.fn(),
  checkSalesOrderExists: vi.fn(),
}));

describe.sequential('Janitor Cron Verification', () => {
  let mFetch: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mPatch.set.mockReturnThis();
    mPatch.inc.mockReturnThis();
    mPatch.commit.mockResolvedValue({ success: true });
    mFetch = writeClient.fetch as ReturnType<typeof vi.fn>;
    process.env.CRON_SECRET = 'test_secret';

    // Suppress expected console noise from intentional error scenarios.
    // These Logger calls are correct production behaviour — we just don't
    // need them polluting the test output.
    vi.spyOn(Logger, 'info').mockImplementation(() => {});
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
  });

  const mockPayload = JSON.stringify({ 
    CustomerID: 'cust_1',
    Order: { Lines: [{ Price: 10, Quantity: 1 }] }
  });

  it('Dead Letter Fallback: Increments retryCount on Cin7 error', async () => {
    mFetch.mockResolvedValueOnce([{
      _id: 'log_1',
      orderNumber: 'ORD-1',
      service: 'cin7',
      status: 'failed',
      payload: mockPayload,
      retryCount: 0
    }]);

    (checkSalesOrderExists as any).mockResolvedValueOnce(false);
    (createSalesOrder as any).mockRejectedValueOnce(new Error('Cin7 API Down'));

    const req = new Request('http://localhost/api/cron/cin7-retry', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const response = await GET(req);
    const body = await response.json();

    expect(body.results[0].status).toBe('failed');
    expect(body.results[0].retryCount).toBe(1);

    expect(writeClient.patch).toHaveBeenCalledWith('log_1');
    expect(mPatch.inc).toHaveBeenCalledWith({ retryCount: 1 });
    expect(mPatch.commit).toHaveBeenCalled();
  });

  it('Partial Failure Resumption: Resumes from ORDER_AUTHORISED', async () => {
    mFetch.mockResolvedValueOnce([{
      _id: 'log_resume',
      orderNumber: 'ORD-RESUME',
      service: 'cin7',
      status: 'failed',
      syncState: 'ORDER_AUTHORISED',
      payload: mockPayload,
      stripeSessionId: 'sess_resume'
    }]);

    (checkSalesOrderExists as any).mockResolvedValueOnce({ SaleID: 'SALE-EXISTING' });
    (createSalesInvoice as any).mockResolvedValue({ success: true });
    (createSalesPayment as any).mockResolvedValue({ success: true });

    const req = new Request('http://localhost/api/cron/cin7-retry', {
      headers: { authorization: 'Bearer test_secret' }
    });
    await GET(req);

    // Should skip Step 1 and Step 2
    expect(createSalesOrder).not.toHaveBeenCalled();
    expect(authoriseSalesOrder).not.toHaveBeenCalled();
    
    // Should execute Step 3 and Step 4
    expect(createSalesInvoice).toHaveBeenCalledWith('SALE-EXISTING', expect.any(Array));
    expect(createSalesPayment).toHaveBeenCalled();
  });

  it('Payment Math: Includes AdditionalCharges correctly', async () => {
    const complexPayload = JSON.stringify({ 
      CustomerID: 'cust_1',
      Order: { 
        Lines: [{ Price: 10, Quantity: 2 }], // 20
        AdditionalCharges: [{ Price: 5, Quantity: 1 }] // 5
      }
    });

    mFetch.mockResolvedValueOnce([{
      _id: 'log_math',
      orderNumber: 'ORD-MATH',
      service: 'cin7',
      status: 'failed',
      syncState: 'INVOICE_AUTHORISED',
      payload: complexPayload,
      stripeSessionId: 'sess_math'
    }]);

    // Pre-flight should find it to resolve currentSaleId
    (checkSalesOrderExists as any).mockResolvedValueOnce({ SaleID: 'SALE-MATH' });

    const req = new Request('http://localhost/api/cron/cin7-retry', {
      headers: { authorization: 'Bearer test_secret' }
    });
    await GET(req);

    // Expected Amount: 10*2 + 5*1 = 25
    expect(createSalesPayment).toHaveBeenCalledWith(expect.objectContaining({
      Amount: 25
    }));
  });

  it('Max Retry Threshold: Verify that the Janitor fetch query uses the maxRetries filter', async () => {
    mFetch.mockResolvedValueOnce([]);

    const req = new Request('http://localhost/api/cron/cin7-retry', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const response = await GET(req);
    const body = await response.json();

    expect(body.message).toBe('No failed logs found to retry.');
    
    expect(mFetch).toHaveBeenCalledWith(
      expect.stringContaining('retryCount < $maxRetries'),
      expect.objectContaining({ maxRetries: 5 })
    );
  });

  it('Pre-Flight Recovery: Marks as success if order already exists and paid', async () => {
    mFetch.mockResolvedValueOnce([{
      _id: 'log_3',
      orderNumber: 'ORD-3',
      service: 'cin7',
      status: 'failed',
      syncState: 'PAYMENT_COMPLETED',
      payload: mockPayload,
      stripeSessionId: 'sess_3'
    }]);

    (checkSalesOrderExists as any).mockResolvedValueOnce({ SaleID: 'SALE-3' });

    const req = new Request('http://localhost/api/cron/cin7-retry', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const response = await GET(req);
    const body = await response.json();

    expect(body.results[0].status).toBe('recovered'); // The response now always says recovered if it finished the loop
    
    expect(mPatch.set).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success'
    }));
  });

  it('Recovery Success: Completes all steps and marks success', async () => {
    mFetch.mockResolvedValueOnce([{
      _id: 'log_4',
      orderNumber: 'ORD-4',
      service: 'cin7',
      status: 'failed',
      payload: mockPayload,
      retryCount: 0
    }]);

    (checkSalesOrderExists as any).mockResolvedValueOnce(false);
    (createSalesOrder as any).mockResolvedValueOnce({ ID: 'NEW-SALE' });
    (authoriseSalesOrder as any).mockResolvedValue({ success: true });
    (createSalesInvoice as any).mockResolvedValue({ success: true });
    (createSalesPayment as any).mockResolvedValue({ success: true });

    const req = new Request('http://localhost/api/cron/cin7-retry', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const response = await GET(req);
    const body = await response.json();

    expect(body.results[0].status).toBe('recovered');
    
    // Verify multi-step sequence
    expect(createSalesOrder).toHaveBeenCalled();
    expect(authoriseSalesOrder).toHaveBeenCalledWith('NEW-SALE', expect.any(Array));
    expect(createSalesInvoice).toHaveBeenCalledWith('NEW-SALE', expect.any(Array));
    expect(createSalesPayment).toHaveBeenCalled();
    
    // Check that success was marked
    expect(mPatch.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    expect(mPatch.set).toHaveBeenCalledWith(expect.objectContaining({ syncState: 'PAYMENT_COMPLETED' }));
  });
  it('Alert Threshold: notifySlack is called when retryCount reaches MAX_RETRIES (5)', async () => {
    // retryCount is 4 — this is the 5th attempt (newRetryCount = 5 = MAX_RETRIES)
    mFetch.mockResolvedValueOnce([{
      _id: 'log_alert',
      orderNumber: 'ORD-ALERT',
      service: 'cin7',
      status: 'failed',
      payload: mockPayload,
      retryCount: 4,
    }]);

    (checkSalesOrderExists as any).mockResolvedValueOnce(false);
    (createSalesOrder as any).mockRejectedValueOnce(new Error('Cin7 permanently down'));

    const notifySlackSpy = vi.spyOn(Logger, 'notifySlack').mockResolvedValue(undefined);

    const req = new Request('http://localhost/api/cron/cin7-retry', {
      headers: { authorization: 'Bearer test_secret' },
    });
    const response = await GET(req);
    const body = await response.json();

    // Cron must still return 200 (per-order failure is handled gracefully)
    expect(response.status).toBe(200);
    expect(body.results[0].retryCount).toBe(5);

    // Slack alert must have fired exactly once with order details
    expect(notifySlackSpy).toHaveBeenCalledTimes(1);
    expect(notifySlackSpy).toHaveBeenCalledWith(
      expect.stringContaining('ORD-ALERT'),
      expect.objectContaining({ orderNumber: 'ORD-ALERT' })
    );
  });

  it('Thread Protector: cron survives and returns 200 if Slack webhook fetch throws', async () => {
    mFetch.mockResolvedValueOnce([{
      _id: 'log_slack_fail',
      orderNumber: 'ORD-SLACK',
      service: 'cin7',
      status: 'failed',
      payload: mockPayload,
      retryCount: 4,
    }]);

    (checkSalesOrderExists as any).mockResolvedValueOnce(false);
    (createSalesOrder as any).mockRejectedValueOnce(new Error('Cin7 down'));

    // Slack itself rejects — Logger.notifySlack must swallow this internally
    // The cron’s per-order catch handles this; outer GET must still return 200
    const notifySlackSpy = vi.spyOn(Logger, 'notifySlack').mockRejectedValueOnce(
      new Error('Slack endpoint unreachable')
    );

    const req = new Request('http://localhost/api/cron/cin7-retry', {
      headers: { authorization: 'Bearer test_secret' },
    });

    const response = await GET(req);

    // Slack rejection must not bubble up to crash the cron handler
    expect(response.status).toBe(200);

    notifySlackSpy.mockRestore();
  });
});



