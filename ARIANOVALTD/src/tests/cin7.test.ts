import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkSalesOrderExists, getProductStock, createSalesOrder } from '@/lib/cin7';

global.fetch = vi.fn();

describe('Cin7 API Client Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CIN7_ACCOUNT_ID = 'test_account';
    process.env.CIN7_API_KEY = 'test_key';
  });

  describe('checkSalesOrderExists', () => {
    it('returns true if stripeSessionId matches CustomerReference', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Total: 1,
          SaleList: [
            { CustomerReference: 'sess_123', OrderNumber: 'SO-001' }
          ]
        })
      });

      const exists = await checkSalesOrderExists('sess_123');
      expect(exists).not.toBeNull();
      expect(exists?.OrderNumber).toBe('SO-001');
    });

    it('returns true if stripeSessionId matches OrderNumber (fallback)', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Total: 1,
          SaleList: [
            { CustomerReference: 'other', OrderNumber: 'sess_123' }
          ]
        })
      });

      const exists = await checkSalesOrderExists('sess_123');
      expect(exists).not.toBeNull();
      expect(exists?.OrderNumber).toBe('sess_123');
    });

    it('returns false if no exact match is found in the list', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Total: 1,
          SaleList: [
            { CustomerReference: 'sess_999', OrderNumber: 'SO-002' }
          ]
        })
      });

      const exists = await checkSalesOrderExists('sess_123');
      expect(exists).toBeNull();
    });
  });

  describe('getProductStock', () => {
    it('returns correct stock data for a SKU', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ProductAvailabilityList: [
            { SKU: 'syrah-2021', Available: 10, OnHand: 15 }
          ]
        })
      });

      const stock = await getProductStock('syrah-2021');
      expect(stock?.Available).toBe(10);
      expect(stock?.SKU).toBe('syrah-2021');
    });
  });
});
