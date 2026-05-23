import { auth, currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { sanityFetch } from "@/sanity/lib/fetch"
import { groq } from "next-sanity"
import MembershipCard from "@/components/profile/MembershipCard"
import PalatePreferences from "@/components/profile/PalatePreferences"
import { UserProfile } from "@clerk/nextjs"

export const revalidate = 0 

export default async function DossierPage() {
  const { userId } = await auth();
  
  // Hard interception block securely enforcing unauthenticated routing bounds structurally
  if (!userId) {
    redirect('/sign-in');
  }

  const customerId = `customer-${userId}`
  const user = await currentUser();

  // Retrieve the Sanity customer profile data
  const customer = await sanityFetch<any>({
    query: groq`*[_type == "customer" && _id == $customerId][0]`,
    params: { customerId }
  });

  // Pull VIP status strictly from Clerk publicMetadata (Backend single source of truth)
  // Fall back to Sanity if Clerk hasn't synced yet, or Bronze/0 as ultimate fallback
  const tier = (user?.publicMetadata?.tier as string) || customer?.tier || 'Bronze';
  const acquisitions = (user?.publicMetadata?.acquisitions as number) || customer?.acquisitions || 0;

  return (
    <div className="flex flex-col gap-12">
      <div>
        <h1 className="font-serif text-4xl text-brand-foreground mb-2 tracking-wide">Member Dossier</h1>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-foreground/60 mb-8">
          Confidential Profile Settings
        </p>
        
        <MembershipCard 
          fullName={user?.fullName || customer?.fullName || "Arianova Member"}
          joinDate={user?.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString()}
          tier={tier}
          acquisitions={acquisitions}
        />
      </div>

      {/* Synchronized Palate Preferences Segments */}
      <div className="bg-brand-surface border border-brand-border rounded-sm shadow-2xl p-8">
        <h3 className="font-serif text-2xl text-brand-foreground mb-2">Palate Preferences</h3>
        <p className="text-sm text-brand-foreground/60 mb-8 font-medium">
          Configure your dossiers exclusively aligning personalized vintage layouts.
        </p>
        
        <PalatePreferences 
          initialPreferences={customer?.palatePreferences || []} 
          frequency={customer?.tastingFrequency || 'collector'} 
        />
      </div>

      {/* Explicit Security Integration Boundaries Custom Theme Mapping */}
      <div className="bg-brand-surface border border-brand-border rounded-sm shadow-2xl overflow-hidden flex flex-col">
        <div className="p-8 pb-0 border-b border-brand-border bg-brand-bg/40">
            <h3 className="font-serif text-2xl text-brand-foreground mb-2">Security Integrations</h3>
            <p className="text-sm text-brand-foreground/60 mb-6 font-medium">Native authentication parameters mapping safely mapped.</p>
        </div>
        <UserProfile 
          routing="hash"
          appearance={{
            elements: {
              card: "shadow-none border-none bg-transparent w-full max-w-none m-0",
              navbar: "hidden", // Completely strips sidebars natively
              pageScrollBox: "px-8 py-4",
              headerTitle: "hidden", 
              headerSubtitle: "hidden",
              profileSectionContent: "border-b border-brand-border pb-6 mb-6",
            }
          }}
        />
      </div>

    </div>
  )
}
