"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

export interface CartItem {
  id: string
  title: string
  price: number
  type: 'wine' | 'event'
  imageUrl: string | null
  imageObj?: any
  quantity: number
}

interface CartContextType {
  cart: CartItem[]
  addToCart: (item: Omit<CartItem, "quantity">) => void
  removeFromCart: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  totalItems: number
  totalPrice: number
  isHydrated: boolean
  isCartOpen: boolean
  openCart: () => void
  closeCart: () => void
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [isHydrated, setIsHydrated] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)

  // Initialize from LocalStorage
  useEffect(() => {
    const stored = localStorage.getItem("arianova_cart")
    if (stored) {
      try { setCart(JSON.parse(stored)) } catch (e) {}
    }
    setIsHydrated(true)
  }, [])

  // Sync to LocalStorage
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("arianova_cart", JSON.stringify(cart))
    }
  }, [cart, isHydrated])

  const addToCart = (item: Omit<CartItem, "quantity">) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id)
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { ...item, quantity: 1 }]
    })
  }

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id))
  }

  const updateQuantity = (id: string, quantity: number) => {
    setCart((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i))
    )
  }

  const clearCart = () => setCart([])
  const openCart = () => setIsCartOpen(true)
  const closeCart = () => setIsCartOpen(false)

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, totalItems, totalPrice, isHydrated, isCartOpen, openCart, closeCart }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) throw new Error("useCart must be used within CartProvider")
  return context
}
