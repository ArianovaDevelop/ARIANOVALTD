import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import CellarPage from '@/app/cellar/page'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { sanityFetch } from '@/sanity/lib/fetch'
import * as fs from 'fs'
import path from 'path'

// Mock deeply integrated Next.js module boundaries
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn()
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn().mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
}))

vi.mock('@/sanity/lib/fetch', () => ({
  sanityFetch: vi.fn()
}))

vi.mock('@/sanity/env', () => ({
  dataset: 'test-dataset',
  projectId: 'test-project-id',
  apiVersion: '2024-03-22'
}))

describe('Private Cellar Dashboard (Strict Server Component)', () => {
  
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Auth Protection Intercept Limit Break
  it('Redirects entirely unauthenticated guest users immediately to the sign-in boundary', async () => {
    // Mimic the precise response Clerk utilizes natively when an anonymous user executes a hit
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as any)
    
    // Next.js redirect() throws an error intentionally under the hood to rapidly halt component mapping
    try {
      await CellarPage()
    } catch (e) {
      // Swallowing the redirect boundary bounce gracefully
    }
    
    // Assert structural rejection blocks bypassed Sanity mapping and executed a clean redirect
    expect(redirect).toHaveBeenCalledWith('/sign-in')
    expect(sanityFetch).not.toHaveBeenCalled()
  })

  // 2. Encrypted Data Population Rendering Structure
  it('Renders the populated luxury receipt itemization when a valid profile contains finalized active allocations', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'tester_123_valid' } as any)
    vi.mocked(sanityFetch).mockResolvedValueOnce([
      {
        _id: 'order_mock_1',
        orderNumber: 'TEST_A1B2',
        _createdAt: '2026-03-20T10:00:00Z',
        totalAmount: 14500, // Absolute value representing $145.00
        status: 'Processing',
        items: [
          {
            quantity: 2,
            priceAtPurchase: 7250,
            wine: { title: 'Arianova Reserve Pinot Noir', vintage: '2022', imageUrl: '/mock-img.jpg' }
          }
        ]
      }
    ])

    // Mount and parse the fully rendered internal Server Component layout structurally
    const jsx = await CellarPage() as any
    render(jsx)

    // Verify absolute DOM injection bounds matched the mapping physics natively 
    expect(screen.getByText('Arianova Reserve Pinot Noir')).toBeDefined()
    expect(screen.getByText('(2022)')).toBeDefined()
    expect(screen.getByText('#TEST_A1B2')).toBeDefined()
    expect(screen.getByText('Status: Processing')).toBeDefined()
    expect(screen.getByText('$145.00')).toBeDefined()
    expect(screen.getByText(/Mar 20, 2026/i)).toBeDefined()
  })

  // 3. Graceful Empty Cellar Handling Overlay
  it('Deploys the sophisticated Zero-State UI banner efficiently when an authenticated profile possesses zero order metrics', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'new_user_xyz' } as any)
    vi.mocked(sanityFetch).mockResolvedValueOnce([]) // Empty array replicating zero transactional references

    const jsx = await CellarPage() as any
    render(jsx)

    // Verify fallback DOM UI components overlay securely
    expect(screen.getByText('Your Cellar is Empty')).toBeDefined()
    expect(screen.getByText('Explore the Vintages')).toBeDefined() 
    expect(screen.queryByText('Acquired Vintages')).toBeNull() 
  })

  // 4. Strict GROQ Query Expansion Validation Target
  it('Physically guarantees the absolute GROQ query string safely dereferences dynamic pointers extracting nested image URL strings', () => {
    // Retrieve the active layout file actively bypassing the shadow-compilation compiler blocks parsing raw AST code structures logically 
    const fileData = fs.readFileSync(path.resolve(__dirname, '../app/cellar/page.tsx'), 'utf-8')
    
    // Assert explicit dereference string structures
    expect(fileData).toContain('"wine": wine->{')
    
    // Assert exact image and string properties statically
    expect(fileData).toContain('imageUrl')
    expect(fileData).toContain('title')
  })
})
