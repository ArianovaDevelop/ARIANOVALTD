import { describe, it, expect, vi, beforeEach } from 'vitest'

// Deep mock Stripe to prevent real instantiation
const { mockConstructEvent } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn()
}))

vi.mock('stripe', () => {
  return {
    default: class Stripe {
      webhooks = { constructEvent: mockConstructEvent };
      checkout = { sessions: { listLineItems: vi.fn() } };
      products = { retrieve: vi.fn() };
    }
  }
})

// Deep mock the Sanity Transaction Client
const { mockCommit, mockPatch, mockCreate, mockFetch } = vi.hoisted(() => {
  const commit = vi.fn().mockResolvedValue(true)
  const patch = vi.fn().mockReturnThis()
  const create = vi.fn().mockReturnThis()
  
  return { 
    mockCommit: commit, 
    mockPatch: patch, 
    mockCreate: create,
    mockFetch: vi.fn()
  }
})

vi.mock('@/sanity/lib/client', () => {
  return {
    client: {
      fetch: mockFetch,
      withConfig: vi.fn().mockReturnValue({
        transaction: () => ({
          create: mockCreate,
          patch: mockPatch,
          commit: mockCommit
        }),
        create: mockCreate,
        fetch: mockFetch
      })
    }
  }
})

// Dynamically invoke the native POST webhook logic handling Stripe intersections
import { POST } from '@/app/api/webhooks/stripe/route'

describe('Stripe Webhook -> Sanity Inventory Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.SANITY_WRITE_TOKEN = 'sanity_token'
  })

  it('Verifies Event signatures and uses Metadata Shortcut for atomicity', async () => {
    // Setup mocks
    mockFetch.mockResolvedValue(null)
    const cart = JSON.stringify([{ id: 'wine_xyz', qty: 2, title: 'Test Wine', price: 2250 }])
    
    // Mock the constructEvent return value
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test',
          amount_total: 4500,
          metadata: { clerkUserId: 'user_123', serializedCart: cart },
          customer_details: { email: 'test@arianova.com', name: 'Arianova Tester' }
        }
      }
    })

    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'stripe-signature': 'test' },
      body: 'raw_stripe_body'
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    
    // ** THE ABSOLUTE INVENTORY LOGIC TEST: Verify Metadata Shortcut logic via Transaction **
    expect(mockPatch).toHaveBeenCalledWith('wine_xyz', expect.any(Function))
    expect(mockCommit).toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      _type: 'order',
      stripeSessionId: 'cs_test',
    }))
  })
})
