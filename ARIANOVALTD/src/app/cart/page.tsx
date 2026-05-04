"use client"

import { useCart } from "@/context/CartContext"
import Image from "next/image"
import Link from "next/link"
import { Trash2, Plus, Minus, Loader2 } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { urlFor } from "@/sanity/lib/image"

export default function CartPage() {
  const { cart, removeFromCart, updateQuantity, totalPrice, isHydrated } = useCart()
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const router = useRouter()

  if (!isHydrated) return null // Prevent hydration mismatch while loading localStorage

  const handleCheckout = async () => {
    setIsCheckingOut(true)
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart }),
      })
      const data = await res.json()

      if (data.url) {
        // Redirect standard browser location strictly to stripe domain
        window.location.href = data.url
      } else if (data.error) {
        toast.error('Allocation Failed', {
          description: 'Our apologies—this vintage was just acquired by another collector. We have updated your cart.'
        })
      }
    } catch (error) {
      console.error(error)
    } finally {
      setIsCheckingOut(false)
    }
  }

  if (cart.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-brand-bg px-6 min-h-[80vh] text-center">
        <h1 className="font-serif text-4xl md:text-5xl text-brand-foreground mb-8">Your Cart is Empty</h1>
        <p className="text-brand-foreground/70 mb-12 font-light tracking-widest text-lg">
          Curate your collection by exploring our active vintages.
        </p>
        <Link
          href="/"
          className="px-10 py-5 bg-brand-surface text-brand-foreground tracking-[0.2em] text-xs font-bold uppercase transition-all rounded-sm hover:bg-brand-accent/80 shadow-md"
        >
          Explore The Cellar
        </Link>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-brand-bg pt-12 pb-24 min-h-screen">
      <div className="container mx-auto px-6 max-w-6xl">
        <h1 className="font-serif text-4xl md:text-5xl text-brand-foreground mb-12 tracking-wide border-b border-brand-border/10 pb-6">
          Your Curated Selection
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
          {/* Cart Items List */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            {cart.map((item) => {
              const isWine = item.type === 'wine';
              const displayImageUrl = (item.imageObj && item.imageObj.asset)
                ? urlFor(item.imageObj)
                  .width(600)
                  .height(800)
                  .quality(100)
                  .fit(isWine ? 'max' : 'crop')
                  .auto('format')
                  .url()
                : item.imageUrl;

              return (
                <div key={item.id} className="flex flex-col sm:flex-row gap-8 items-center sm:items-start border-b border-brand-border/10 pb-8">

                  {/* Image */}
                  <div className={`relative w-32 h-44 ${isWine ? 'bg-[#F8F6F0]' : 'bg-brand-surface/80'} rounded-sm overflow-hidden flex-shrink-0 shadow-sm`}>
                    {displayImageUrl ? (
                      <Image
                        src={displayImageUrl}
                        alt={item.title}
                        fill
                        className={`${isWine ? 'object-contain p-2' : 'object-cover'} transition-opacity duration-500`}
                        sizes="128px"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-brand-surface/40 font-serif text-sm italic">
                        No Image
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 flex flex-col items-center sm:items-start text-center sm:text-left w-full h-full justify-between">
                    <div className="mb-6 sm:mb-0">
                      <h3 className="font-serif text-2xl md:text-3xl text-brand-foreground tracking-wide mb-3">
                        {item.title}
                      </h3>
                      <p className="text-sm font-semibold tracking-widest text-brand-foreground/60 uppercase">
                        ${(item.price / 100).toFixed(2)}
                      </p>
                    </div>

                    <div className="flex items-center gap-8 mt-auto pt-4">
                      {/* Quantity Selector */}
                      <div className="flex items-center border border-brand-border/20 rounded-sm overflow-hidden bg-white/50">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="px-4 py-2 hover:bg-brand-surface/5 transition-colors text-brand-foreground/60 hover:text-brand-foreground"
                        >
                          <Minus className="w-3 h-3" strokeWidth={2} />
                        </button>
                        <span className="w-10 text-center text-sm font-semibold text-brand-foreground">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, Math.min(60, item.quantity + 1))}
                          className="px-4 py-2 hover:bg-brand-surface/5 transition-colors text-brand-foreground/60 hover:text-brand-foreground"
                        >
                          <Plus className="w-3 h-3" strokeWidth={2} />
                        </button>
                      </div>

                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-brand-foreground/40 hover:text-brand-foreground transition-colors flex items-center gap-2 text-xs uppercase tracking-widest font-semibold"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                        <span className="hidden sm:inline">Remove</span>
                      </button>
                    </div>
                  </div>

                  {/* Line Item Total */}
                  <div className="hidden sm:flex h-full items-end pb-1">
                    <p className="font-serif text-2xl text-brand-foreground">
                      ${((item.price * item.quantity) / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Checkout Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white p-8 rounded-sm shadow-xl border border-brand-border/10 flex flex-col sticky top-32">
              <h2 className="font-serif text-3xl text-brand-bg mb-8">Summary</h2>

              <div className="flex justify-between items-center mb-5 text-brand-bg/80">
                <span className="font-light tracking-wide text-lg">Subtotal</span>
                <span className="font-semibold">${(totalPrice / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center mb-8 text-brand-bg/80">
                <span className="font-light tracking-wide text-lg">Shipping</span>
                <span className="text-sm font-medium uppercase tracking-widest text-brand-bg/50">Calculated at Checkout</span>
              </div>

              <div className="flex justify-between items-center pt-8 border-t border-black/10 mb-10">
                <span className="font-serif text-2xl text-brand-bg">Total</span>
                <span className="font-serif text-3xl text-brand-bg font-semibold">${(totalPrice / 100).toFixed(2)}</span>
              </div>

              <button
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="w-full py-5 tracking-[0.2em] text-xs font-bold uppercase transition-all rounded-sm shadow-md bg-brand-bg text-brand-foreground hover:bg-brand-accent hover:text-brand-bg hover:shadow-lg disabled:opacity-70 flex justify-center items-center gap-3"
              >
                {isCheckingOut ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Proceed to Checkout"
                )}
              </button>

              <div className="mt-8 pt-6 border-t border-black/5 flex flex-col gap-3 text-center text-[10px] text-brand-bg/40 uppercase tracking-[0.2em] font-bold">
                <p>Secure SSL Encrypted Checkout</p>
                <p>Authenticity Guaranteed by Arianova</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
