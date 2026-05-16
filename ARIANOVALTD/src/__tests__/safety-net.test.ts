import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- 1. MOCK STRIPE ENGINE ---
const { mockListSessions } = vi.hoisted(() => ({
  mockListSessions: vi.fn(),
}))

vi.mock('stripe', () => {
  return {
    default: class Stripe {
      checkout = {
        sessions: {
          list: mockListSessions,
          listLineItems: vi.fn().mockRejectedValue(new Error('Should use Metadata Shortcut')),
        }
      };
      products = {
        retrieve: vi.fn().mockRejectedValue(new Error('Should use Metadata Shortcut')),
      };
      webhooks = {
        constructEvent: vi.fn().mockImplementation((body) => JSON.parse(body)),
      };
    }
  }
})

// --- 2. MOCK SANITY CLIENT ---
const { mockFetch, mockTransaction, mockPatch, mockCreate, mockCommit } = vi.hoisted(() => {
  const commit = vi.fn().mockResolvedValue(true)
  const patch = vi.fn().mockReturnThis()
  const create = vi.fn().mockReturnThis()
  const transaction = {
    create: create,
    patch: patch,
    commit: commit,
    createIfNotExists: vi.fn().mockReturnThis(),
  }
  
  return {
    mockFetch: vi.fn(),
    mockTransaction: vi.fn().mockReturnValue(transaction),
    mockPatch: patch,
    mockCreate: create,
    mockCommit: commit,
  }
})

vi.mock('@/sanity/lib/client', () => {
  return {
    client: {
      fetch: mockFetch,
      withConfig: vi.fn().mockReturnValue({
        transaction: mockTransaction,
        create: mockCreate,
        fetch: mockFetch,
      })
    }
  }
})

// --- 3. DYNAMIC IMPORTS ---
import { POST as webhookPost } from '@/app/api/webhooks/stripe/route'
import { GET as cronGet } from '@/app/api/cron/cleanup-locks/route'

describe('Safety Net & Idempotency Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.SANITY_WRITE_TOKEN = 'sanity_token'
    process.env.CRON_SECRET = 'cron_secret'
  })

  const mockCart = JSON.stringify([
    { id: 'wine_1', qty: 2, title: 'Mock Wine', price: 5000 }
  ])

  describe('Webhook: checkout.session.completed', () => {
    it('Processes new sessions and creates an idempotency record', async () => {
      // Setup: Record does not exist
      mockFetch.mockResolvedValue(null)

      const payload = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            amount_total: 10000,
            metadata: { serializedCart: mockCart, clerkUserId: 'user_1' },
            customer_details: { email: 'test@arianova.com' }
          }
        }
      }

      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig' },
        body: JSON.stringify(payload)
      })

      const res = await webhookPost(req)
      expect(res.status).toBe(200)

      // Verify Idempotency Record Creation
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'processed-session-cs_123',
        _type: 'sessionRecord',
        status: 'completed'
      }))

      // Verify Stock Deduction (Metadata Shortcut used)
      expect(mockPatch).toHaveBeenCalledWith('wine_1', expect.any(Function))
      expect(mockCommit).toHaveBeenCalled()
    })

    it('Skips processing if the sessionRecord already exists (Idempotency)', async () => {
      // Setup: Record already exists
      mockFetch.mockResolvedValue({ _id: 'processed-session-cs_123' })

      const payload = {
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_123', metadata: { serializedCart: mockCart } } }
      }

      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig' },
        body: JSON.stringify(payload)
      })

      const res = await webhookPost(req)
      const data = await res.json()
      
      expect(data.skipped).toBe(true)
      expect(mockTransaction).not.toHaveBeenCalled()
    })
  })

  describe('Cron: Inventory Safety Net', () => {
    it('Reconciles inventory for missed webhook events', async () => {
      // 1. Stripe returns 1 recently expired session
      mockListSessions.mockResolvedValue({
        data: [{
          id: 'cs_abandoned',
          status: 'expired',
          metadata: { serializedCart: mockCart }
        }]
      })

      // 2. Sanity check: session has NOT been processed (missed webhook)
      mockFetch.mockResolvedValue(null)

      const req = new Request('http://localhost', {
        headers: { 'authorization': 'Bearer cron_secret' }
      })

      const res = await cronGet(req)
      const data = await res.json()

      expect(data.reconciled).toBe(1)
      
      // Verify reconciliation logic
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'processed-session-cs_abandoned',
        status: 'expired'
      }))
      expect(mockPatch).toHaveBeenCalledWith('wine_1', expect.any(Function))
      expect(mockCommit).toHaveBeenCalled()
    })

    it('Skips reconciliation if sessions are already processed', async () => {
      mockListSessions.mockResolvedValue({
        data: [{ id: 'cs_done', status: 'expired', metadata: { serializedCart: mockCart } }]
      })
      mockFetch.mockResolvedValue({ _id: 'processed-session-cs_done' })

      const req = new Request('http://localhost', {
        headers: { 'authorization': 'Bearer cron_secret' }
      })

      const res = await cronGet(req)
      const data = await res.json()

      expect(data.reconciled).toBe(0)
      expect(mockTransaction).not.toHaveBeenCalled()
    })
  })
})
