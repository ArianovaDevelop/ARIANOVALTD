"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function AgeGate() {
  const [isVerified, setIsVerified] = useState<boolean>(true);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    // Check if the verification cookie exists
    const match = document.cookie.match(new RegExp('(^| )arianova_age_verified=([^;]+)'));
    if (!match) {
      setIsVerified(false);
      // Lock background scrolling while the gate is active
      document.body.style.overflow = 'hidden';
    }
  }, []);

  const handleVerify = () => {
    // Set verification cookie for 30 days
    const date = new Date();
    date.setTime(date.getTime() + (30 * 24 * 60 * 60 * 1000));
    document.cookie = `arianova_age_verified=true;expires=${date.toUTCString()};path=/`;
    
    // Release the scroll lock
    document.body.style.overflow = 'unset';
    setIsVerified(true);
  };

  const handleReject = () => {
    window.location.href = "https://www.google.com";
  };

  // Prevent hydration mismatch by only rendering after mount
  if (!hasMounted) return null;

  return (
    <AnimatePresence>
      {!isVerified && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1.2, ease: "easeInOut" } }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0B0B0B] text-[#F5F5F5]"
        >
          {/* Main Content Container */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 1 }}
            className="flex flex-col items-center space-y-12 max-w-lg mx-auto text-center px-6"
          >
            {/* Branding */}
            <div className="space-y-4">
              <h1 className="font-serif text-5xl md:text-6xl text-[#D4B57A] font-light">
                Arianova
              </h1>
              <p className="font-sans uppercase tracking-[0.3em] text-[10px] text-white/50">
                Curators of Fine Vintages
              </p>
            </div>

            {/* Inquiry */}
            <div className="space-y-6">
              <h2 className="font-serif text-3xl md:text-4xl">Are you over 18?</h2>
              <p className="font-sans text-sm text-white/60 leading-relaxed font-light">
                To enter the Arianova cellar and view our exclusive allocations, you must be of legal drinking age in your country of residence.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col w-full space-y-4 pt-4">
              <button
                onClick={handleVerify}
                className="w-full py-4 bg-[#D4B57A] hover:bg-[#D4B57A]/90 transition-colors text-[#0B0B0B] font-sans uppercase tracking-widest font-bold text-xs"
              >
                Yes, I am over 18
              </button>
              <button
                onClick={handleReject}
                className="w-full py-4 border border-white/20 hover:bg-white/5 transition-colors text-white/80 font-sans uppercase tracking-widest font-bold text-xs"
              >
                No, I am under 18
              </button>
            </div>
            
            {/* Footer Legal */}
            <p className="font-sans text-[10px] text-white/40 uppercase tracking-widest pt-12">
              By entering, you agree to our Terms of Service and Privacy Policy.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
