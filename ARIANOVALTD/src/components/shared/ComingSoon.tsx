"use client";

import { motion } from "framer-motion";

export default function ComingSoon() {
  return (
    <div className="fixed inset-0 z-[10000] overflow-hidden bg-[#0B0B0B]">
      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-60 scale-[1.05]"
      >
        <source src="/media/Panoramic_zoom_out.mp4" type="video/mp4" />
      </video>

      {/* Glassmorphic Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

      {/* Main Content */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center space-y-8 text-center"
        >
          {/* Logo/Branding */}
          <div className="space-y-4">
            <h1 className="font-serif text-6xl md:text-8xl text-[#D4B57A] font-light tracking-tighter">
              Arianova
            </h1>
            <div className="h-px w-24 bg-[#D4B57A]/30 mx-auto" />
            <p className="font-sans uppercase tracking-[0.5em] text-[10px] md:text-xs text-white/70">
              Curators of Fine Vintages
            </p>
          </div>

          {/* Announcement */}
          <div className="space-y-6 max-w-2xl">
            <h2 className="font-serif text-3xl md:text-5xl text-white font-light leading-tight">
              Our collection is being curated. <br />
              <span className="italic opacity-80">Opening Soon.</span>
            </h2>
            <p className="font-sans text-sm md:text-base text-white/50 leading-relaxed font-light tracking-wide max-w-lg mx-auto">
              We are currently preparing our exclusive allocations for a special release. The full Arianova portfolio will be accessible shortly.
            </p>
          </div>

          {/* Interactive Element (Visual focus) */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ delay: 1, duration: 2, ease: "easeInOut" }}
            className="h-px bg-gradient-to-r from-transparent via-[#D4B57A]/50 to-transparent max-w-md w-full"
          />

          {/* Footer Info */}
          <div className="pt-12 space-y-4">
            <p className="font-sans text-[10px] text-[#D4B57A] uppercase tracking-[0.4em] font-medium">
              Inquiries
            </p>
            <p className="font-sans text-xs text-white/40 tracking-widest lowercase">
              concierge@arianova.it
            </p>
          </div>
        </motion.div>
      </div>

      {/* Subtle Bottom Bar */}
      <div className="absolute bottom-12 left-0 w-full flex justify-center opacity-30">
        <p className="font-sans text-[8px] uppercase tracking-[0.8em] text-white">
          Italian Excellence • Global Curation
        </p>
      </div>
    </div>
  );
}
