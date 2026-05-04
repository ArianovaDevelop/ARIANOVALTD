"use client"

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { urlFor } from "@/sanity/lib/image";

interface WineCardProps {
  wine: {
    _id: string;
    title: string;
    slug: string;
    price: number;
    vintage: number | null;
    imageUrl: string | null;
    imageObj?: any;
    physical_stock: number;
    committed_stock: number;
  };
}

export default function WineCard({ wine }: WineCardProps) {
  const available = (wine.physical_stock || 0) - (wine.committed_stock || 0);
  const isSoldOut = available <= 0;

  const MotionLink = motion.create(Link);

  const displayImageUrl = wine.imageObj 
    ? urlFor(wine.imageObj).width(800).url() // Let Sanity determine height based on original aspect ratio/crop
    : wine.imageUrl;

  return (
    <MotionLink 
      href={`/wines/${wine.slug}`} 
      className="group flex flex-col gap-5 relative rounded-sm transition-all duration-300"
      whileHover={{ scale: 1.02 }}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <motion.div 
        className="relative aspect-[3/4] w-full overflow-hidden bg-[#F8F6F0] border border-brand-border/30 rounded-sm"
        initial={{ borderColor: "rgba(245, 245, 245, 0.03)" }}
        whileHover={{ 
          boxShadow: "0px 20px 40px rgba(0, 0, 0, 0.8)",
          borderColor: "rgba(197, 160, 89, 0.4)" 
        }}
      >
        {displayImageUrl ? (
          <Image
            src={displayImageUrl}
            alt={wine.title}
            fill
            className={`object-contain transition-all duration-1000 group-hover:scale-105 p-4 ${isSoldOut ? 'opacity-80 grayscale sm:grayscale-0' : ''}`}
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-brand-surface/40 font-serif text-sm italic">
            Vintage Hidden
          </div>
        )}
        
        {/* Visual Scarcity Sub-System */}
        {isSoldOut ? (
          <div className="absolute top-4 right-4 bg-brand-surface/90 text-brand-foreground text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-sm shadow-xl backdrop-blur-md border border-brand-border/50">
            Cellar Empty
          </div>
        ) : available <= 5 ? (
          <div className="absolute top-4 right-4 bg-brand-accent text-brand-bg text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-sm shadow-xl backdrop-blur-md border border-brand-accent/30">
            Rare Vintage: Only {available} left!
          </div>
        ) : null}
      </motion.div>

      <div className="flex flex-col gap-1.5 text-center mt-1 px-2">
        <h3 className="font-serif text-lg tracking-wide text-brand-foreground truncate transition-colors group-hover:text-brand-foreground/70">
          {wine.title}
        </h3>
        <div className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-brand-foreground/60">
          <span>{wine.vintage || "NV"}</span>
          <span>•</span>
          <span>${(wine.price / 100).toFixed(2)}</span>
        </div>
      </div>
    </MotionLink>
  );
}
