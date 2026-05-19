"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { completeOnboarding } from "@/app/actions/profile"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { Grape, Wine, GlassWater, Sparkles, Clock, CalendarDays, Key, Gem } from "lucide-react"

export default function OnboardingFlow() {
  const [step, setStep] = useState(1)
  const [preferences, setPreferences] = useState<string[]>([])
  const [frequency, setFrequency] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const { user } = useUser()

  const togglePreference = (val: string) => {
    setPreferences(prev => 
      prev.includes(val) ? prev.filter(p => p !== val) : [...prev, val]
    )
  }

  const handleComplete = async () => {
    setIsSubmitting(true)
    try {
      await completeOnboarding(preferences, frequency)
      
      // Synchronize the local Clerk JWT securely immediately to bypass Middleware locks
      await user?.reload()

      toast.success("Vintage Secured", {
        description: "Your dossier has been validated securely. Welcome to Arianova."
      })

      // Wait a fraction of a second ensuring the JWT cookie securely propagates natively
      setTimeout(() => {
        window.location.href = "/"
      }, 500)
    } catch (error) {
      toast.error("Process Failed", { description: "Secure mutation interrupted." })
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6 relative z-50">
      <div className="max-w-xl w-full">
        <div className="text-center mb-12">
          <h1 className="font-serif text-3xl md:text-4xl text-brand-foreground mb-3 tracking-wide">
            Sommelier Consultation
          </h1>
          <p className="text-brand-foreground/60 text-sm uppercase tracking-widest font-semibold">
            Curating your exclusive dossier
          </p>
        </div>

        <div className="bg-brand-surface border border-brand-border/20 rounded-sm shadow-xl p-8 min-h-[420px] flex flex-col relative overflow-hidden">
          <AnimatePresence mode="wait">
            
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col h-full"
              >
                <h2 className="font-serif text-2xl text-brand-foreground mb-8 text-center">What defines your palate?</h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-auto">
                   {[
                     { id: 'bold-reds', label: 'Bold Reds', icon: Grape },
                     { id: 'light-reds', label: 'Light Reds', icon: Wine },
                     { id: 'crisp-whites', label: 'Crisp Whites', icon: GlassWater },
                     { id: 'sparkling', label: 'Sparkling', icon: Sparkles },
                   ].map((item) => {
                     const isSelected = preferences.includes(item.id)
                     const Icon = item.icon
                     return (
                       <button
                         key={item.id}
                         onClick={() => togglePreference(item.id)}
                         className={`p-4 border rounded-sm flex items-center gap-3 transition-all ${
                           isSelected 
                             ? 'border-brand-border bg-brand-surface/5 ring-1 ring-brand-accent' 
                             : 'border-brand-border/10 hover:border-brand-border/40'
                         }`}
                       >
                         <Icon className={`w-5 h-5 ${isSelected ? 'text-brand-foreground' : 'text-brand-foreground/50'}`} />
                         <span className={`font-serif text-lg ${isSelected ? 'text-brand-foreground' : 'text-brand-foreground/70'}`}>
                           {item.label}
                         </span>
                       </button>
                     )
                   })}
                </div>

                <div className="pt-8 mt-4">
                  <button
                    disabled={preferences.length === 0}
                    onClick={() => setStep(2)}
                    className="w-full py-4 tracking-[0.2em] text-xs font-bold uppercase transition-all rounded-sm shadow-md border border-brand-accent/50 text-brand-foreground hover:bg-brand-accent hover:text-brand-bg hover:border-brand-accent disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col h-full"
              >
                <h2 className="font-serif text-2xl text-brand-foreground mb-8 text-center">How frequently do you taste?</h2>
                
                <div className="flex flex-col gap-4 mb-auto">
                   {[
                     { id: 'daily', label: 'Daily Taster', icon: Clock },
                     { id: 'weekly', label: 'Weekly Explorer', icon: CalendarDays },
                     { id: 'special-occasion', label: 'Special Occasion', icon: Gem },
                     { id: 'collector', label: 'Collector', icon: Key },
                   ].map((item) => {
                     const isSelected = frequency === item.id
                     const Icon = item.icon
                     return (
                       <button
                         key={item.id}
                         onClick={() => setFrequency(item.id)}
                         className={`p-4 border rounded-sm flex items-center gap-4 transition-all ${
                           isSelected 
                             ? 'border-brand-border bg-brand-surface/5 ring-1 ring-brand-accent' 
                             : 'border-brand-border/10 hover:border-brand-border/40'
                         }`}
                       >
                         <Icon className={`w-5 h-5 ${isSelected ? 'text-brand-foreground' : 'text-brand-foreground/50'}`} />
                         <span className={`font-serif text-lg ${isSelected ? 'text-brand-foreground' : 'text-brand-foreground/70'}`}>
                           {item.label}
                         </span>
                       </button>
                     )
                   })}
                </div>

                <div className="flex gap-4 pt-8 mt-4">
                  <button
                    onClick={() => setStep(1)}
                    className="px-6 py-4 tracking-[0.2em] text-xs font-bold uppercase transition-all rounded-sm border border-brand-border/30 text-brand-foreground/70 hover:border-brand-accent/50 hover:text-brand-foreground"
                  >
                    Back
                  </button>
                  <button
                    disabled={!frequency || isSubmitting}
                    onClick={handleComplete}
                    className="flex-1 py-4 tracking-[0.2em] text-xs font-bold uppercase transition-all rounded-sm shadow-md border border-brand-accent/50 text-brand-foreground hover:bg-brand-accent hover:text-brand-bg hover:border-brand-accent disabled:opacity-30 disabled:cursor-not-allowed flex justify-center items-center"
                  >
                    {isSubmitting ? "Finalizing..." : "Secure Dossier"}
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
