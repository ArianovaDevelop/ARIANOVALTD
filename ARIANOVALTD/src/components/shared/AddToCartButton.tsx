"use client"

import { useCart } from "@/context/CartContext"
import { toast } from "sonner"
import { motion } from "framer-motion"

interface AddToCartButtonProps {
  wine: {
    _id: string
    title: string
    price: number
    imageUrl: string | null
    imageObj?: any
    winery?: string
  }
  available: number
}

export default function AddToCartButton({ wine, available }: AddToCartButtonProps) {
  const { addToCart } = useCart()
  const isSoldOut = available <= 0

  const handleAdd = () => {
    addToCart({
      id: wine._id,
      title: wine.title,
      price: wine.price,
      type: 'wine',
      imageUrl: wine.imageUrl,
      imageObj: wine.imageObj,
      winery: wine.winery,
    })

    // Premium Toast Hook
    toast.success('Bottle Secured', {
      description: `${wine.title} has been added to your cart selection.`,
      duration: 3500,
    })
  }

  return (
    <div className="w-full md:w-auto relative">
      <motion.button
        whileTap={!isSoldOut ? { scale: 0.98 } : {}}
        disabled={isSoldOut}
        onClick={handleAdd}
        className={`px-10 py-5 tracking-[0.2em] text-xs font-bold uppercase rounded-sm w-full shadow-md
          ${isSoldOut
            ? 'bg-brand-surface text-brand-foreground/40 cursor-not-allowed'
            : 'transition-colors bg-brand-surface text-brand-foreground hover:bg-brand-accent/80 hover:shadow-lg'}`}
      >
        {isSoldOut ? "Sold Out" : "Add to My Curation"}
      </motion.button>
    </div>
  )
}
