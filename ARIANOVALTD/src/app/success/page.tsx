import Stripe from 'stripe'
import { sanityFetch } from "@/sanity/lib/fetch"
import { groq } from "next-sanity"
import { CheckCircle, Wine, FileText, ChevronRight } from "lucide-react"
import Link from 'next/link'
import ClearCart from './ClearCart'
import Image from 'next/image'

// Ensure zero caching on the Success Receipt
export const revalidate = 0

// Initialize Server-side Stripe API Client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2023-10-16' as any,
})

// Strongly typed GROQ pull resolving deeply nested references
const ORDER_QUERY = groq`*[_type == "order" && stripeSessionId == $sessionId][0] {
  _id,
  orderNumber,
  totalAmount,
  status,
  "items": items[] {
    quantity,
    priceAtPurchase,
    "wine": wine->{
      title,
      "imageUrl": images[0].asset->url,
      vintage,
      tastingNotes,
      "slug": slug.current
    }
  }
}`

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const resolvedParams = await searchParams;
  const sessionId = resolvedParams.session_id;

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <p className="font-serif text-brand-foreground">Invalid Auth Token. Please refer to your emailed receipt.</p>
      </div>
    )
  }

  // Hydrate exact transaction strings automatically via Stripe backend API
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'customer_details']
    })
  } catch (err) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <p className="font-serif text-brand-foreground">Session expired or invalidated securely by Arianova protocols.</p>
      </div>
    )
  }

  // Ping Sanity natively to verify the webhook effectively bridged the inventory mutations seamlessly
  const order = await sanityFetch<any>({
    query: ORDER_QUERY,
    params: { sessionId }
  })

  // Fallback defaults safely extracting data maps
  const customerName = session.customer_details?.name || 'Valued Collector'
  const email = session.customer_details?.email

  return (
    <div className="min-h-screen bg-brand-bg pt-12 pb-24">
      {/* Background script to functionally clear the client-side cart local storage */}
      <ClearCart />

      <div className="container mx-auto px-6 max-w-4xl">
        <div className="flex flex-col items-center text-center mb-12">
          <CheckCircle className="w-16 h-16 text-brand-foreground/80 mb-6" strokeWidth={1.5} />
          <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-foreground/60 mb-4">
            Allocation Confirmed
          </h2>
          <h1 className="font-serif text-4xl md:text-5xl text-brand-foreground tracking-wide mb-6">
            Thank you, {customerName}
          </h1>
          <p className="text-lg font-light text-brand-foreground/80 tracking-wide max-w-2xl">
            Your collection has been secured. We have dispatched a detailed receipt to <span className="font-medium text-brand-foreground">{email}</span>.
          </p>
        </div>

        {/* Floating Digital Receipt Card Interface */}
        <div className="bg-brand-surface p-8 md:p-12 rounded-sm shadow-2xl border border-brand-border relative overflow-hidden">
          
          {/* Internal Sanity Verification Live Polling Banner */}
          <div className="absolute top-0 left-0 w-full bg-brand-surface py-2 px-8 flex justify-between items-center border-b border-brand-border/10">
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-foreground/60">
              Backend System Verification
            </span>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${order ? 'bg-green-600 animate-pulse' : 'bg-amber-500 animate-bounce'}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-foreground">
                {order ? `Status: ${order.status}` : 'Awaiting Webhook Finalization...'}
              </span>
            </div>
          </div>

          <div className="mt-8 mb-10 border-b border-brand-border/10 pb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-foreground/40 mb-1">
                Order Identifier Number
              </p>
              <p className="font-serif text-2xl text-brand-foreground">
                {order?.orderNumber || session.id.slice(-8).toUpperCase()}
              </p>
            </div>
            <div className="text-left md:text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-foreground/40 mb-1">
                Amount Settled
              </p>
              <p className="font-serif text-2xl text-brand-foreground">
                ${((session.amount_total || 0) / 100).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Acquired Cellar Items */}
          <h3 className="font-serif text-xl text-brand-foreground mb-6">Acquired Vintages</h3>
          <div className="flex flex-col gap-6">
            {order ? (
              order.items.map((item: any, idx: number) => (
                <div key={idx} className="flex gap-6 items-center p-4 border border-brand-border/5 rounded-sm bg-brand-bg/30">
                  <div className="relative w-28 h-28 bg-[#F8F6F0] rounded-md overflow-hidden flex-shrink-0 shadow-sm border border-brand-border/10">
                    {item.wine?.imageUrl && (
                      <Image 
                        src={item.wine?.imageUrl} 
                        alt={item.wine?.title} 
                        fill 
                        className="object-contain p-2" 
                        sizes="112px" 
                      />
                    )}
                  </div>

                  <div className="flex-1">
                    <h4 className="font-serif text-lg text-brand-foreground tracking-wide">
                      {item.wine?.title}
                    </h4>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-foreground/60 mt-1">
                      QTY: {item.quantity} &nbsp;|&nbsp; ${(item.priceAtPurchase / 100).toFixed(2)} EACH
                    </p>
                    
                    {/* Functional Link for Tasting Notes */}
                    <Link 
                      href={`/wines/${item.wine?.slug}`}
                      className="mt-4 inline-flex items-center gap-2 text-[9px] uppercase tracking-widest text-brand-accent font-bold cursor-pointer hover:text-brand-foreground transition-colors bg-brand-bg px-3 py-1.5 rounded-sm border border-brand-accent/20"
                    >
                      <FileText className="w-3 h-3" />
                      View Sommelier Notes
                      <ChevronRight className="w-3 h-3 ml-[-4px]" />
                    </Link>
                  </div>
                </div>
              ))
            ) : (
             <div className="py-10 text-center text-brand-foreground/70 font-serif text-lg animate-pulse">
               Synchronizing your vintages from the cellar...
             </div>
            )}
          </div>

        </div>

        <div className="mt-12 flex justify-center">
          <Link 
            href="/" 
            className="px-12 py-5 bg-brand-accent text-brand-bg tracking-[0.2em] text-xs font-bold uppercase transition-all rounded-sm hover:bg-brand-accent/90 shadow-xl flex items-center gap-3"
          >
            <Wine className="w-4 h-4" />
            Return to Cellar
          </Link>
        </div>

      </div>
    </div>
  )
}
