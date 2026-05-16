import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/webhooks/cin7/stock/route';
import { client } from '@/sanity/lib/client';
import { getProductStock } from '@/lib/cin7';

vi.mock('@/sanity/lib/client', () => {
  const mPatch = {
    set: vi.fn().mockReturnThis(),
    commit: vi.fn().mockResolvedValue(true)
  };
  const mWriteClient = {
    fetch: vi.fn(),
    patch: vi.fn().mockReturnValue(mPatch)
  };
  return {
    client: {
      withConfig: vi.fn().mockReturnValue(mWriteClient)
    }
  };
});

vi.mock('@/lib/cin7', () => ({
  getProductStock: vi.fn()
}));

describe('Cin7 Reverse Stock Sync Webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test_secret';
  });

  it('rejects unauthorized requests', async () => {
    const req = new Request('http://localhost:3000/api/webhooks/cin7/stock?secret=wrong', {
      method: 'POST',
      body: JSON.stringify({ SKU: 'test-wine' })
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects payload without SKU', async () => {
    const req = new Request('http://localhost:3000/api/webhooks/cin7/stock?secret=test_secret', {
      method: 'POST',
      body: JSON.stringify({ Event: 'StockAdjustment' }) // no sku
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 if SKU not found in Cin7', async () => {
    (getProductStock as any).mockResolvedValueOnce(null);

    const req = new Request('http://localhost:3000/api/webhooks/cin7/stock?secret=test_secret', {
      method: 'POST',
      body: JSON.stringify({ SKU: 'fake-wine' })
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('successfully patches Sanity if SKU is found', async () => {
    // Mock Cin7 returning 5 available
    (getProductStock as any).mockResolvedValueOnce({ SKU: 'real-wine', Available: 5 });

    // Mock Sanity finding the product
    const mockWriteClient = client.withConfig({ token: 'mock' });
    (mockWriteClient.fetch as any).mockResolvedValueOnce({ _id: 'prod_123' });

    const req = new Request('http://localhost:3000/api/webhooks/cin7/stock?secret=test_secret', {
      method: 'POST',
      body: JSON.stringify({ SKU: 'real-wine' })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.newQuantity).toBe(5);
    
    // Verify patch was called correctly
    expect(mockWriteClient.patch).toHaveBeenCalledWith('prod_123');
  });
});
