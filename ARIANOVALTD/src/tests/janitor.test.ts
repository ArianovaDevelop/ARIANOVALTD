import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/cron/cin7-retry/route';
import { client } from '@/sanity/lib/client';
import { createSalesOrder, checkSalesOrderExists, Cin7SalePayload } from '@/lib/cin7';

// Mock Sanity Client
vi.mock('@/sanity/lib/client', () => {
  const mPatchSet = vi.fn().mockReturnThis();
  const mPatchInc = vi.fn().mockReturnThis();
  const mPatchCommit = vi.fn().mockResolvedValue({ success: true });
  
  const mWithConfig = vi.fn().mockReturnValue({
    fetch: vi.fn(),
    patch: vi.fn(() => ({
      set: mPatchSet,
      inc: mPatchInc,
      commit: mPatchCommit
    })),
  });

  return {
    client: {
      withConfig: mWithConfig,
    },
  };
});

// Mock Cin7 Library
vi.mock('@/lib/cin7', () => ({
  createSalesOrder: vi.fn(),
  checkSalesOrderExists: vi.fn(),
}));

describe('Janitor Cron Verification', () => {
  const mockWriteClient = client.withConfig({ token: 'mock' });
  let mFetch: any;
  let mPatch: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mFetch = mockWriteClient.fetch as ReturnType<typeof vi.fn>;
    mPatch = mockWriteClient.patch as ReturnType<typeof vi.fn>;
    process.env.CRON_SECRET = 'test_secret';
  });

  it('Dead Letter Fallback: Increments retryCount on Cin7 503 Error', async () => {
    // 1. Mock Sanity returning 1 failed log
    mFetch.mockResolvedValueOnce([{
      _id: 'log_123',
      orderNumber: 'ORD-1',
      service: 'cin7',
      status: 'failed',
      stripeSessionId: 'sess_1',
      retryCount: 0,
      payload: JSON.stringify({ 
        CustomerID: 'cust_1',
        Customer: 'Test',
        CustomerReference: 'sess_1',
        Location: 'Main',
        Order: { Lines: [] }
      } as Cin7SalePayload)
    }]);

    // 2. Mock Pre-Flight Check: Order does NOT exist in Cin7
    (checkSalesOrderExists as any).mockResolvedValueOnce(false);

    // 3. Mock Cin7 API throwing a 503
    const networkError = new Error('Cin7 API 503 Service Unavailable');
    (networkError as any).status = 503;
    (createSalesOrder as any).mockRejectedValueOnce(networkError);

    // 4. Execute
    const req = new Request('http://localhost/api/cron/cin7-retry', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const response = await GET(req);
    const body = await response.json();

    // 5. Assertions
    expect(body.results[0].status).toBe('failed');
    expect(body.results[0].retryCount).toBe(1);

    // Verify Sanity patch was called to increment retry count
    const patchCall = mPatch('log_123');
    expect(patchCall.inc).toHaveBeenCalledWith({ retryCount: 1 });
    expect(patchCall.set).toHaveBeenCalledWith({
      errorMessage: expect.stringContaining('Retry 1 Failed: Cin7 API 503')
    });
    expect(patchCall.commit).toHaveBeenCalled();
  });

  it('Recovery Success: Patches to success on attempt 2', async () => {
    // 1. Mock Sanity returning 1 log that has already failed once
    mFetch.mockResolvedValueOnce([{
      _id: 'log_123',
      orderNumber: 'ORD-1',
      service: 'cin7',
      status: 'failed',
      stripeSessionId: 'sess_1',
      retryCount: 1,
      payload: JSON.stringify({ 
        CustomerID: 'cust_1',
        Customer: 'Test',
        CustomerReference: 'sess_1',
        Location: 'Main',
        Order: { Lines: [] }
      } as Cin7SalePayload)
    }]);

    // 2. Mock Pre-Flight Check: Order does NOT exist in Cin7
    (checkSalesOrderExists as any).mockResolvedValueOnce(false);

    // 3. Mock Cin7 API SUCCEEDING
    (createSalesOrder as any).mockResolvedValueOnce({ success: true });

    // 4. Execute
    const req = new Request('http://localhost/api/cron/cin7-retry', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const response = await GET(req);
    const body = await response.json();

    // 5. Assertions
    expect(body.results[0].status).toBe('recovered');

    // Verify Sanity patch was called to mark success
    const patchCall = mPatch('log_123');
    expect(patchCall.set).toHaveBeenCalledWith({ status: 'success' });
    expect(patchCall.inc).not.toHaveBeenCalled(); // No increment on success
    expect(patchCall.commit).toHaveBeenCalled();
  });
});
