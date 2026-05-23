import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/cron/sync-delivery/route';
import { writeClient } from '@/sanity/lib/write-client';
import { checkSalesOrderExists } from '@/lib/cin7';

// ============================================================================
// STRICT MOCKING LAYER
// ============================================================================

// 1. Mock Sanity Write Client so no real database mutations occur
vi.mock('@/sanity/lib/write-client', () => {
  const mPatch = {
    set: vi.fn().mockReturnThis(),
    commit: vi.fn().mockResolvedValue(true)
  };
  return {
    writeClient: {
      fetch: vi.fn(),
      patch: vi.fn().mockReturnValue(mPatch)
    }
  };
});

// 2. Mock Cin7 Utility to simulate various ERP payload states
vi.mock('@/lib/cin7', () => ({
  checkSalesOrderExists: vi.fn()
}));

// 3. Mock Logger to keep test terminal output clean
vi.mock('@/lib/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('Delivery Sync Cron Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test_secret';
  });

  const createRequest = (authHeader: string | null) => {
    const headers = new Headers();
    if (authHeader) headers.set('authorization', authHeader);
    return new Request('http://localhost:3000/api/cron/sync-delivery', {
      headers
    });
  };

  // ============================================================================
  // TARGET ASSERTIONS
  // ============================================================================

  it('rejects unauthorized requests with 401 when token is invalid or missing', async () => {
    const req = createRequest('Bearer wrong_secret');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('safely bypasses orders that are not fully shipped yet', async () => {
    // Mock Sanity returning 1 pending order
    (writeClient.fetch as any).mockResolvedValueOnce([
      { _id: 'doc_1', orderNumber: '12345678', status: 'Processing' }
    ]);
    
    // Mock Cin7 returning an un-shipped status
    (checkSalesOrderExists as any).mockResolvedValueOnce({
      FulfillmentStatus: 'PICKING'
    });

    const req = createRequest('Bearer test_secret');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.processedCount).toBe(1);
    expect(data.updatedCount).toBe(0); // Assert no updates
    
    // Verify Sanity mutation patch was NEVER called
    expect(writeClient.patch).not.toHaveBeenCalled();
  });

  it('successfully triggers the Sanity patch mutation when FulfillmentStatus === SHIPPED', async () => {
    // Mock Sanity returning 1 pending order
    (writeClient.fetch as any).mockResolvedValueOnce([
      { _id: 'doc_1', orderNumber: '12345678', status: 'Processing' }
    ]);
    
    // Mock Cin7 returning SHIPPED with tracking keys
    (checkSalesOrderExists as any).mockResolvedValueOnce({
      FulfillmentStatus: 'SHIPPED',
      Carrier: 'FedEx',
      TrackingNumber: '1234FEDEX'
    });

    const req = createRequest('Bearer test_secret');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.updatedCount).toBe(1);
    
    // Verify patch was called targeting the correct document ID
    expect(writeClient.patch).toHaveBeenCalledWith('doc_1');
  });

  it('safely catches individual network failures and continues processing subsequent orders in the batch', async () => {
    // Mock Sanity returning a batch of 3 orders
    (writeClient.fetch as any).mockResolvedValueOnce([
      { _id: 'doc_1', orderNumber: 'ORDER1', status: 'Processing' },
      { _id: 'doc_2', orderNumber: 'ORDER2', status: 'Processing' }, // We will force this to fail
      { _id: 'doc_3', orderNumber: 'ORDER3', status: 'Processing' }
    ]);

    // Mock Cin7 responses: Success -> Network Failure -> Success
    (checkSalesOrderExists as any)
      .mockResolvedValueOnce({ FulfillmentStatus: 'SHIPPED' })          // ORDER1
      .mockRejectedValueOnce(new Error('Simulated Network Timeout'))    // ORDER2 (Crash)
      .mockResolvedValueOnce({ FulfillmentStatus: 'SHIPPED' });         // ORDER3

    const req = createRequest('Bearer test_secret');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    // Assert 3 were processed in the loop, but only 2 successfully updated
    expect(data.processedCount).toBe(3);
    expect(data.updatedCount).toBe(2);
    
    // Verify patch was called exactly twice (for doc_1 and doc_3)
    expect(writeClient.patch).toHaveBeenCalledTimes(2);
    expect(writeClient.patch).toHaveBeenCalledWith('doc_1');
    expect(writeClient.patch).toHaveBeenCalledWith('doc_3');
  });
});
