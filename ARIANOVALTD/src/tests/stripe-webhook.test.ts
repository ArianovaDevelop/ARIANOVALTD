import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/webhooks/stripe/route';
import { createSalesPayment, createSalesOrder, authoriseSalesOrder, createSalesInvoice } from '@/lib/cin7';
import { Logger } from '@/lib/logger';

// ─── Stripe Mock ─────────────────────────────────────────────────────────────
// constructEvent bypasses real signature verification and returns our mock event
const mockConstructEvent = vi.fn();
vi.mock('stripe', () => ({
  default: class MockStripe {
    webhooks = { constructEvent: mockConstructEvent };
  },
}));

// ─── Sanity Read Client (idempotency check) ───────────────────────────────────
vi.mock('@/sanity/lib/client', () => ({
  client: { fetch: vi.fn().mockResolvedValue(null) },
}));

// Grab the mock after vi.mock hoisting so we can override per-test
import { client as sanityReadClient } from '@/sanity/lib/client';
const mClientFetch = () => sanityReadClient.fetch as ReturnType<typeof vi.fn>;

// ─── Sanity Write Client (transactions + log writes) ─────────────────────────
const mTxCreate  = vi.fn().mockReturnThis();
const mTxPatch   = vi.fn().mockReturnThis();
const mTxCommit  = vi.fn().mockResolvedValue({ success: true });
const mTxInstance = { create: mTxCreate, patch: mTxPatch, commit: mTxCommit };
vi.mock('@/sanity/lib/write-client', () => ({
  writeClient: {
    transaction: vi.fn(() => mTxInstance),
    create: vi.fn().mockResolvedValue({ _id: 'mock_log_id' }),
    patch: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnThis(),
      inc: vi.fn().mockReturnThis(),
      setIfMissing: vi.fn().mockReturnThis(),
      append: vi.fn().mockReturnThis(),
      commit: vi.fn().mockResolvedValue({}),
    }),
  },
}));

// ─── Logger (fully mocked to isolate Sanity writes) ──────────────────────────
vi.mock('@/lib/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    createTransactionLog: vi.fn().mockResolvedValue('mock_log_id'),
    updateTransactionLog: vi.fn().mockResolvedValue(undefined),
    notifySlack: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Cin7 API (all steps mocked) ─────────────────────────────────────────────
vi.mock('@/lib/cin7', () => ({
  createSalesOrder:     vi.fn().mockResolvedValue({ ID: 'SALE_XYZ' }),
  authoriseSalesOrder:  vi.fn().mockResolvedValue({ success: true }),
  createSalesInvoice:   vi.fn().mockResolvedValue({ success: true }),
  createSalesPayment:   vi.fn().mockResolvedValue({ success: true }),
}));

// ─── URLs ─────────────────────────────────────────────────────────────────────
vi.mock('@/lib/urls', () => ({ getAppUrl: vi.fn().mockReturnValue('https://arianova.com') }));

// ─── Shared test fixtures ─────────────────────────────────────────────────────
const CART = [{ id: 'wine_1', qty: 2, type: 'wine', title: 'Syrah 2021', price: 7500, sku: 'syrah-2021' }];

const MOCK_COMPLETED_SESSION = {
  id: 'cs_test_abc123',
  amount_total: 15000, // $150.00 in cents
  created: 1700000000,
  metadata: {
    serializedCart: JSON.stringify(CART),
    clerkUserId: 'user_123',
  },
  customer_details: {
    name: 'Test Collector',
    email: 'collector@test.com',
    address: { line1: '1 Vino St', city: 'Auckland', country: 'NZ', postal_code: '1010' },
  },
  shipping_cost: null,
};

const MOCK_EXPIRED_SESSION = {
  id: 'cs_test_expired456',
  metadata: { serializedCart: JSON.stringify(CART) },
};

function makeRequest(body = '{}') {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'mock_sig' },
    body,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('Stripe Webhook Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.ENABLE_EMAILS = 'false';
    // Default: not already processed
    vi.mocked(sanityReadClient.fetch).mockResolvedValue(null as any); // Sanity SDK types fetch() as non-nullable but GROQ [0] returns null at runtime
  });

  // ── Domain 2.1: The Abandonment Path ─────────────────────────────────────
  it('Abandonment Path: session.expired triggers dec patch on committed_stock', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.expired',
      data: { object: MOCK_EXPIRED_SESSION },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);

    // The transaction must commit (releasing the soft lock)
    expect(mTxCommit).toHaveBeenCalledTimes(1);

    // The session record must be stamped as 'expired'
    expect(mTxCreate).toHaveBeenCalledWith(expect.objectContaining({
      _type: 'sessionRecord',
      sessionId: MOCK_EXPIRED_SESSION.id,
      status: 'expired',
    }));

    // A dec patch must be applied for the cart item
    expect(mTxPatch).toHaveBeenCalledWith('wine_1', expect.any(Function));
  });

  // ── Domain 2.2: The Durable Audit Trail ──────────────────────────────────
  it('Durable Audit Trail: creates status:pending log in Sanity BEFORE calling Cin7', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: { object: MOCK_COMPLETED_SESSION },
    });

    // Track call order via a shared sequence array
    const callSequence: string[] = [];
    vi.mocked(Logger.createTransactionLog).mockImplementation(async () => {
      callSequence.push('createTransactionLog');
      return 'mock_log_id';
    });
    vi.mocked(createSalesOrder).mockImplementation(async () => {
      callSequence.push('createSalesOrder');
      return { ID: 'SALE_XYZ' };
    });

    await POST(makeRequest());

    // Pending log must be created with status:'pending'
    expect(Logger.createTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', service: 'cin7' })
    );

    // Audit trail MUST precede the Cin7 API call
    expect(callSequence.indexOf('createTransactionLog')).toBeLessThan(
      callSequence.indexOf('createSalesOrder')
    );
  });

  // ── Domain 2.3a: The Accounting Ledger Push (env var set) ─────────────────
  it('Accounting Ledger Push: uses CIN7_STRIPE_ACCOUNT_NAME and gross Stripe total', async () => {
    process.env.CIN7_STRIPE_ACCOUNT_NAME = 'Stripe Clearing';

    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: { object: MOCK_COMPLETED_SESSION },
    });

    await POST(makeRequest());

    // Amount must be cents / 100 = $150.00
    expect(createSalesPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        Amount: 150,           // 15000 / 100
        Account: 'Stripe Clearing',
      })
    );
  });

  // ── Domain 2.3b: The Accounting Ledger Push (env var missing → fallback) ──
  it('Accounting Ledger Push: falls back to "1201" when CIN7_STRIPE_ACCOUNT_NAME is undefined', async () => {
    delete process.env.CIN7_STRIPE_ACCOUNT_NAME;

    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: { object: MOCK_COMPLETED_SESSION },
    });

    await POST(makeRequest());

    expect(createSalesPayment).toHaveBeenCalledWith(
      expect.objectContaining({ Account: '1201' })
    );

    // Logger.warn must fire to signal the missing env var
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('CIN7_STRIPE_ACCOUNT_NAME')
    );
  });

  // ── Domain 2.4: The Lock Release ─────────────────────────────────────────
  it('Lock Release: marks Sanity log as success and commits stock decrement after full Cin7 sync', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: { object: MOCK_COMPLETED_SESSION },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);

    // Sanity transaction must commit (committed_stock decremented, order created)
    expect(mTxCommit).toHaveBeenCalledTimes(1);

    // Final log update must set status:'success' and syncState:'PAYMENT_COMPLETED'
    expect(Logger.updateTransactionLog).toHaveBeenCalledWith(
      'mock_log_id',
      expect.objectContaining({ status: 'success', syncState: 'PAYMENT_COMPLETED' })
    );

    // All Cin7 steps must have executed
    expect(createSalesOrder).toHaveBeenCalledTimes(1);
    expect(authoriseSalesOrder).toHaveBeenCalledTimes(1);
    expect(createSalesInvoice).toHaveBeenCalledTimes(1);
    expect(createSalesPayment).toHaveBeenCalledTimes(1);
  });

  // ── Idempotency guard ──────────────────────────────────────────────────────
  it('Idempotency: skips processing if session was already handled', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: { object: MOCK_COMPLETED_SESSION },
    });

    // Simulate Sanity returning an existing idempotency record
    vi.mocked(sanityReadClient.fetch).mockResolvedValueOnce({ _id: 'processed-session-cs_test_abc123' } as any);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
    expect(createSalesOrder).not.toHaveBeenCalled();
  });
});
