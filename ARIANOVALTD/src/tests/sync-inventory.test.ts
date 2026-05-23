import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/cron/sync-inventory/route';
import { writeClient } from '@/sanity/lib/write-client';
import { getLiveCin7Stock } from '@/lib/cin7';

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
  getLiveCin7Stock: vi.fn()
}));

// 3. Mock Logger to keep test terminal output clean
vi.mock('@/lib/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('Inventory Sync Cron Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test_secret';
  });

  const createRequest = (authHeader: string | null) => {
    const headers = new Headers();
    if (authHeader) headers.set('authorization', authHeader);
    return new Request('http://localhost:3000/api/cron/sync-inventory', {
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

  it('Perfect Drift Alignment: executes Sanity patch when Cin7 stock differs', async () => {
    // Mock Sanity returning 1 wine with physical_stock = 10
    (writeClient.fetch as any).mockResolvedValueOnce([
      { _id: 'wine_1', sku: 'SYRAH-2021', physical_stock: 10 }
    ]);
    
    // Mock Cin7 returning authoritative stock = 5
    (getLiveCin7Stock as any).mockResolvedValueOnce({
      'SYRAH-2021': 5
    });

    const req = createRequest('Bearer test_secret');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.processedCount).toBe(1);
    expect(data.updatedCount).toBe(1);
    
    // Verify patch was called to correct the drift
    expect(writeClient.patch).toHaveBeenCalledWith('wine_1');
  });

  it('Perfect Equity: bypasses patch when Cin7 stock matches Sanity (saves quota)', async () => {
    // Mock Sanity returning 1 wine with physical_stock = 15
    (writeClient.fetch as any).mockResolvedValueOnce([
      { _id: 'wine_1', sku: 'CAB-2022', physical_stock: 15 }
    ]);
    
    // Mock Cin7 returning matching stock = 15
    (getLiveCin7Stock as any).mockResolvedValueOnce({
      'CAB-2022': 15
    });

    const req = createRequest('Bearer test_secret');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.processedCount).toBe(1);
    expect(data.updatedCount).toBe(0);
    
    // Verify patch was NEVER called
    expect(writeClient.patch).not.toHaveBeenCalled();
  });

  it('Network Timeout / Error Resilience: returns 502 safely when upstream fails', async () => {
    // Mock Sanity returning 1 wine
    (writeClient.fetch as any).mockResolvedValueOnce([
      { _id: 'wine_1', sku: 'MERLOT', physical_stock: 10 }
    ]);

    // Mock Cin7 network failure / timeout
    (getLiveCin7Stock as any).mockRejectedValueOnce(new Error('Simulated Timeout Error'));

    const req = createRequest('Bearer test_secret');
    const res = await GET(req);
    
    // Asserts that the cron aborted gracefully with 502 Bad Gateway
    expect(res.status).toBe(502);
    
    // Verify Sanity was never mutated during the abort
    expect(writeClient.patch).not.toHaveBeenCalled();
  });
});
