import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { sanityFetch } from "@/sanity/lib/fetch"
import { groq } from "next-sanity"
import Image from "next/image"
import Link from "next/link"
import { Wine } from "lucide-react"
import StatusIcon from "@/components/shared/StatusIcon"
import { urlFor } from "@/sanity/lib/image"

// Ensure zero caching on private encrypted customer profiles securely
export const revalidate = 0 

// Deep structural GROQ parsing strictly bounding arrays to the Clerk User identity
const ORDERS_QUERY = groq`*[_type == "order" && customer._ref == $customerId] | order(_createdAt desc) {
  _id,
  orderNumber,
  _createdAt,
  totalAmount,
  status,
  "items": items[] {
    quantity,
    priceAtPurchase,
    "wine": wine->{
      title,
      vintage,
      "imageUrl": images[0].asset->url,
      "imageObj": images[0]
    }
  }
}`

export default async function CellarPage() {
  const { userId } = await auth();

  // 1. Strict Authorization Protocol
  if (!userId) {
    redirect('/sign-in')
  }

  // 2. Hydrate Private Encrypted Order References structurally tracking the Shadow Profile
  const customerId = `customer-${userId}`
  const orders = await sanityFetch<any[]>({
    query: ORDERS_QUERY,
    params: { customerId }
  })

  return (
    <div className="min-h-screen bg-brand-bg pt-16 pb-24">
      <div className="container mx-auto px-6 max-w-5xl">
        <h1 className="font-serif text-4xl text-brand-foreground mb-2 tracking-wide">The Private Cellar</h1>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-foreground/60 mb-12">
          Your Curated Arianova Estate Collection
        </p>

        {orders.length === 0 ? (
          // Authenticated Empty State Overlay
          <div className="flex flex-col items-center justify-center py-24 border border-brand-border bg-brand-surface shadow-2xl rounded-sm text-center">
            <Wine className="w-12 h-12 text-brand-accent/40 mb-6" strokeWidth={1} />
            <h2 className="font-serif text-2xl text-brand-foreground mb-3">Your Cellar is Empty</h2>
            <p className="text-brand-foreground/60 text-sm max-w-md mb-8">
              You have not acquired any allocations yet. Explore our current vintages to begin building your professional collection sequence.
            </p>
            <Link 
              href="/" 
              className="px-10 py-4 bg-brand-surface text-brand-foreground text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-brand-accent/80 transition-colors rounded-sm shadow-md"
            >
              Explore the Vintages
            </Link>
          </div>
        ) : (
          // Fully Hydrated Order Itemization Log
          <div className="flex flex-col gap-8">
            {orders.map((order) => (
              <div key={order._id} className="bg-brand-surface border border-brand-border rounded-sm shadow-2xl overflow-hidden flex flex-col md:flex-row">
                
                {/* Meta Transaction Roster (Left Side / Top) */}
                <div className="bg-brand-bg/40 p-8 md:w-1/3 flex flex-col justify-between border-b md:border-b-0 md:border-r border-brand-border">
                  <div>
                    <div className="flex items-center gap-2 mb-6">
                      <StatusIcon status={order.status} id={order._id} />
                      <span className="text-[10px] uppercase tracking-widest font-bold text-brand-foreground">
                        Status: {order.status || 'Received'}
                      </span>
                    </div>
                    
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-foreground/50 mb-1">
                      Order Reference
                    </p>
                    <p className="font-serif text-lg text-brand-foreground mb-5">
                      #{order.orderNumber}
                    </p>

                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-foreground/50 mb-1">
                      Acquisition Date
                    </p>
                    <p className="text-brand-foreground text-sm mb-5 font-medium">
                      {new Date(order._createdAt).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric'
                      })}
                    </p>
                  </div>

                  <div className="pt-5 border-t border-brand-border/10">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-foreground/50 mb-1">
                      Total Allocated
                    </p>
                    <p className="font-serif text-2xl text-brand-foreground">
                      ${(order.totalAmount / 100).toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Acquired Vintages Log (Right Side / Bottom) */}
                <div className="p-8 md:w-2/3">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-foreground mb-6">
                    Acquired Vintages
                  </h3>
                  <div className="flex flex-col gap-6">
                    {order.items?.map((item: any, idx: number) => {
                      const displayImageUrl = item.wine?.imageObj 
                        ? urlFor(item.wine.imageObj).width(200).height(200).url()
                        : item.wine?.imageUrl;
                        
                      return (
                        <div key={idx} className="flex items-center gap-6 py-2 border-b border-brand-border/5 last:border-0">
                          <div className="flex-1">
                            <p className="font-serif text-xl text-brand-foreground leading-tight">
                              {item.wine?.title} {item.wine?.vintage && <span className="opacity-70 text-lg">({item.wine.vintage})</span>}
                            </p>
                            <p className="text-[10px] uppercase font-bold tracking-widest text-brand-foreground/60 mt-2">
                              QTY: {item.quantity} &nbsp;|&nbsp; ${(item.priceAtPurchase / 100).toFixed(2)} EACH
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
