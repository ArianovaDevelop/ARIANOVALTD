"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useCart } from "@/context/CartContext";
import FadeInView from "@/components/shared/FadeInView";

export default function EventList({ events }: { events: any[] }) {
  const { addToCart, openCart } = useCart();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleAddToCart = (event: any) => {
    setLoadingId(event._id);
    
    // Add to unified cart instead of bypassing to Stripe
    addToCart({
      id: event._id,
      title: event.title,
      price: event.price,
      type: 'event',
      imageUrl: event.imageUrl || "https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?q=100&w=1000&auto=format&fit=crop",
      imageObj: event.imageObj
    });

    // Open the sidebar so the user can adjust quantities (e.g. buying 4 tickets)
    setTimeout(() => {
      openCart();
      setLoadingId(null);
    }, 300);
  };

  if (!events || events.length === 0) {
    return (
      <div className="flex justify-center py-32 text-brand-foreground/60 font-serif italic text-xl">
        No upcoming experiences at this time.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-32">
      {events.map((event, index) => {
        const available = event.physical_stock - event.committed_stock;
        const isSoldOut = event.physical_stock <= 0 || available <= 0;
        const isImageRight = index % 2 === 0;

        const eventDate = new Date(event.date);

        return (
          <FadeInView key={event._id} direction="up">
            <div className={`flex flex-col md:flex-row gap-12 items-center ${isImageRight ? 'md:flex-row-reverse' : ''}`}>

              {/* Image Block */}
              <div className="w-full md:w-1/2 relative aspect-[4/5] overflow-hidden">
                <img
                  src={event.imageUrl || "https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?q=80&w=1000&auto=format&fit=crop"}
                  alt={event.title}
                  className={`object-cover w-full h-full transition-transform duration-1000 hover:scale-105 ${isSoldOut ? 'grayscale opacity-80' : ''}`}
                />
              </div>

              {/* Text Block */}
              <div className="w-full md:w-1/2 flex flex-col justify-center px-4 md:px-12">
                <div className="flex gap-4 items-center mb-6">
                  <div className="px-3 py-1 border border-brand-border/20 text-brand-foreground text-xs uppercase tracking-[0.2em]">
                    {eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <span className="text-brand-foreground/60 text-sm tracking-widest uppercase">{event.location}</span>
                </div>

                <h2 className="font-serif text-4xl md:text-5xl text-brand-foreground mb-6 leading-tight">
                  {event.title}
                </h2>

                {/* Clean string fallback since rich text rendering is outside scope without sanity/portable-text */}
                <p className="text-brand-foreground/80 text-lg leading-relaxed font-light mb-10">
                  Join us for an exclusive gathering. Reserve your placement.
                </p>

                <div className="border-t border-brand-border/10 pt-8 flex items-center justify-between">
                  {event.price === 0 ? (
                    <span className="text-xl font-serif text-brand-foreground">Complimentary</span>
                  ) : (
                    <span className="text-xl font-serif text-brand-foreground">${(event.price / 100).toFixed(2)} NZD</span>
                  )}

                  {isSoldOut ? (
                    <span className="text-sm uppercase tracking-[0.2em] text-brand-foreground/40 font-semibold px-6 py-3">
                      At Capacity
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAddToCart(event)}
                      disabled={loadingId === event._id}
                      className="px-8 py-3 bg-brand-accent text-brand-bg hover:bg-brand-accent/90 disabled:opacity-50 transition-all text-xs font-semibold uppercase tracking-[0.2em] shadow-lg shadow-brand-accent/10"
                    >
                      {loadingId === event._id ? 'Securing...' : 'RSVP'}
                    </button>
                  )}
                </div>
              </div>

            </div>
          </FadeInView>
        );
      })}
    </div>
  );
}
