"use client"

import { useCart } from "@/context/CartContext"
import { motion, AnimatePresence } from "framer-motion"
import { X, Trash2, Plus, Minus, Loader2 } from "lucide-react"
import { useState } from "react"
import Image from "next/image"
import { toast } from "sonner"
import { urlFor } from "@/sanity/lib/image"

export default function CartSidebar() {
  const { cart, removeFromCart, updateQuantity, totalPrice, isCartOpen, closeCart, isHydrated } = useCart()
  const [isCheckingOut, setIsCheckingOut] = useState(false)

  if (!isHydrated) return null

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

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-brand-bg shadow-2xl z-[101] flex flex-col border-l border-brand-border/10"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-brand-border/10 bg-white/80 backdrop-blur-md">
              <h2 className="font-serif text-2xl text-brand-bg tracking-wide">Your Cellar</h2>
              <button
                onClick={closeCart}
                className="p-2 text-brand-bg/60 hover:text-brand-bg transition-colors rounded-full hover:bg-black/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-70">
                  <p className="font-serif text-lg text-brand-foreground mb-2">Your selection is empty</p>
                  <p className="text-xs uppercase tracking-widest text-brand-foreground/60">Explore vintages to begin</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-6">
                  <AnimatePresence mode="popLayout">
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
                        <motion.li
                          key={item.id}
                          layout
                          initial={{ opacity: 0, scale: 0.9, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                          className="flex gap-4 border-b border-brand-border/10 pb-6"
                        >
                          <div className={`relative w-24 h-32 ${isWine ? 'bg-[#F8F6F0]' : 'bg-brand-surface/80'} rounded-sm overflow-hidden flex-shrink-0 shadow-sm`}>
                            {displayImageUrl ? (
                              <Image
                                src={displayImageUrl}
                                alt={item.title}
                                fill
                                className={`${isWine ? 'object-contain p-1' : 'object-cover'} transition-opacity duration-500`}
                                sizes="96px"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-brand-foreground/30 font-serif text-xs">No Image</div>
                            )}
                          </div>

                          <div className="flex-1 flex flex-col justify-between">
                            <div>
                              <h3 className="font-serif text-lg text-brand-foreground leading-tight mb-1">{item.title}</h3>
                              <p className="text-[10px] font-semibold tracking-widest text-brand-foreground/60 uppercase">
                                ${(item.price / 100).toFixed(2)}
                              </p>
                            </div>

                            <div className="flex items-center justify-between mt-4">
                              <div className="flex items-center border border-brand-border/20 rounded-sm overflow-hidden bg-white/50">
                                <button
                                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                  className="px-2 py-1 flex items-center justify-center hover:bg-brand-surface/5 text-brand-foreground/60 hover:text-brand-foreground"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-6 text-center text-xs font-semibold text-brand-foreground">
                                  {item.quantity}
                                </span>
                                <button
                                  onClick={() => updateQuantity(item.id, Math.min(60, item.quantity + 1))}
                                  className="px-2 py-1 flex items-center justify-center hover:bg-brand-surface/5 text-brand-foreground/60 hover:text-brand-foreground"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>

                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="text-brand-foreground/40 hover:text-brand-foreground transition-colors p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div className="p-6 bg-white border-t border-brand-border/10 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
                <div className="flex justify-between items-center mb-6">
                  <span className="font-serif text-lg text-brand-bg/80">Total</span>
                  <span className="font-serif text-2xl text-brand-bg font-semibold">${(totalPrice / 100).toFixed(2)}</span>
                </div>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCheckout}
                  disabled={isCheckingOut}
                  className="w-full py-4 tracking-[0.2em] text-xs font-bold uppercase transition-colors rounded-sm shadow-md bg-brand-surface text-brand-foreground hover:bg-brand-accent/80 disabled:opacity-70 flex justify-center items-center gap-3"
                >
                  {isCheckingOut ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : "Checkout"}
                </motion.button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
