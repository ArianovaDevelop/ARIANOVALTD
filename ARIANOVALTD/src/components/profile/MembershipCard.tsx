import { Award } from "lucide-react"

interface MembershipCardProps {
  fullName: string;
  joinDate: string;
  tier: string;
  acquisitions: number;
}

export default function MembershipCard({ fullName, joinDate, tier, acquisitions }: MembershipCardProps) {
  let gradient = "from-[#b87333] to-[#8a5626]" // Copper / Bronze Base

  if (tier === "Gold") {
    gradient = "from-brand-surface to-[#2A2A2A] border-brand-accent/50 shadow-[0_0_30px_rgba(212,175,55,0.1)]"
  } else if (tier === "Silver") {
    gradient = "from-brand-surface to-[#222] border-brand-foreground/30 shadow-2xl"
  } else if (tier === "Bronze") {
    gradient = "from-brand-surface to-[#151515] border-brand-border/50 shadow-xl"
  }

  return (
    <div className={`relative overflow-hidden rounded-sm p-8 text-brand-foreground border bg-gradient-to-br ${gradient}`}>
      {/* Decorative Shimmer Layout Block */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-brand-accent/5 rounded-full blur-2xl transform translate-x-10 -translate-y-10" />

      <div className="relative z-10 flex flex-col h-full justify-between">
        <div className="flex justify-between items-start mb-12">
          <div>
            <h3 className="font-serif text-3xl mb-1 tracking-wide">{fullName || "Arianova Member"}</h3>
            <p className="text-xs uppercase tracking-widest opacity-80 font-semibold">
              Member Since {new Date(joinDate).getFullYear() || new Date().getFullYear()}
            </p>
          </div>
          <Award className="w-8 h-8 opacity-90" />
        </div>

        <div className="flex justify-between items-end border-t border-white/20 pt-4 mt-8">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-70 mb-1">Status Tier</p>
            <p className="font-serif text-2xl">{tier} Collector</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-70 mb-1">Acquisitions</p>
            <p className="font-sans font-medium text-lg">{acquisitions} Orders</p>
          </div>
        </div>
      </div>
    </div>
  )
}
