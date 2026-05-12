import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ui } from "@clerk/ui";
import { CartProvider } from "@/context/CartContext";
import Navbar from "@/components/shared/Navbar";
import CartSidebar from "@/components/shared/CartSidebar";
import { Toaster } from "sonner";
import Footer from "@/components/shared/Footer";
import AgeGate from "@/components/shared/AgeGate";
import ComingSoon from "@/components/shared/ComingSoon";
import { Analytics } from "@vercel/analytics/react";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["300", "400", "500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.arianova.co.nz"),
  title: "Arianova | Curation of Emotion & Italian Excellence",
  description: "We don't just select wines — we design experiences. Every bottle is chosen to match a feeling, to elevate a moment, to turn a gathering into something rare.",
  openGraph: {
    title: "Arianova | Curation of Emotion & Italian Excellence",
    description: "We don't just select wines — we design experiences.",
    url: "/",
    siteName: "Arianova",
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      ui={ui}
      localization={{
        formButtonPrimary: 'Log in',
        signIn: {
          start: {
            title: 'MEMBER ACCESS | ARIANOVA CURATORS',
            subtitle: 'Welcome back to the Portfolio. Enter the cellar to view your private collection.',
            actionText: 'New to Arianova?',
            actionLink: 'Join !'
          }
        },
        signUp: {
          start: {
            title: 'JOIN THE CURATION',
            subtitle: 'Acquire exclusive allocations from the world\'s finest estates.',
            actionText: 'Already a member?',
            actionLink: 'Log In'
          }
        }
      }}
      appearance={{
        theme: dark,
        cssLayerName: 'clerk',
        variables: {
          colorPrimary: "#D4B57A", // Must be hex for Clerk
          colorBackground: "#1A1A1A", // brand-surface
          colorForeground: "#F5F5F5", // Replaces colorText
          colorInputForeground: "#F5F5F5", // Replaces colorInputText
          colorInput: "#0B0B0B", // Replaces colorInputBackground
          colorMutedForeground: "rgba(245, 245, 245, 0.6)", // Replaces colorTextSecondary
        },
        elements: {
          card: "bg-brand-surface border border-brand-border shadow-2xl",
          headerTitle: "font-serif text-brand-foreground uppercase tracking-widest text-2xl",
          headerSubtitle: "text-brand-foreground/60 font-light",
          formButtonPrimary: "bg-brand-accent hover:opacity-90 text-brand-bg font-bold tracking-widest uppercase transition-opacity rounded-sm py-3",
          socialButtonsBlockButton: "bg-brand-bg border border-brand-border text-brand-foreground hover:bg-brand-surface transition-all rounded-sm",
          socialButtonsBlockButtonText: "font-sans font-medium uppercase tracking-widest text-[10px] text-brand-foreground",
          socialButtonsBlockButtonBadge: "hidden", // Handled by global CSS override
          badge: "hidden", // Handled by global CSS override
          footerActionLink: "text-brand-accent hover:text-brand-accent/80 transition-colors font-semibold",
          formFieldLabel: "text-brand-foreground font-sans uppercase tracking-[0.2em] text-[10px] mb-2",
          formFieldInput: "bg-brand-bg border-brand-border text-brand-foreground placeholder:text-brand-foreground/30 focus:ring-brand-accent focus:border-brand-accent transition-all h-12 w-full rounded-sm",
          identityPreviewText: "text-brand-foreground",
          identityPreviewEditButtonIcon: "text-brand-accent",
          formFieldInputShowPasswordButton: "text-brand-foreground/40 hover:text-brand-foreground",
          dividerLine: "bg-brand-border",
          dividerText: "text-brand-foreground/40 uppercase text-[10px] tracking-widest",
          userButtonPopoverCard: "bg-brand-surface border border-brand-border shadow-2xl rounded-sm",
          userPreviewMainIdentifier: "!text-brand-foreground font-sans font-semibold",
          userPreviewSecondaryIdentifier: "!text-brand-foreground/60 font-sans text-xs pt-1",
          userButtonPopoverActionButton: "hover:bg-brand-bg transition-colors !text-white",
          userButtonPopoverActionButtonText: "!text-white font-sans font-medium uppercase tracking-widest text-[10px]",
          userButtonPopoverActionButtonIcon: "!text-brand-accent",
          userButtonPopoverFooter: "hidden", 
        },
      }}
    >
      <html lang="en" className={`h-full antialiased dark ${inter.variable} ${cormorant.variable}`}>
        <body className="min-h-full flex flex-col font-sans selection:bg-brand-accent/30 selection:text-brand-accent">
          {process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true" ? (
            <ComingSoon />
          ) : (
            <CartProvider>
              <Navbar />
              <main className="flex-1 flex flex-col">{children}</main>
              <Footer />
              <CartSidebar />
              <Toaster
                position="bottom-center"
                toastOptions={{
                  style: { background: '#1A1A1A', color: '#F5F5F5', borderColor: 'rgba(245, 245, 245, 0.1)', flexWrap: 'nowrap' }
                }}
              />
              <AgeGate />
              <Analytics />
            </CartProvider>
          )}
        </body>
      </html>
    </ClerkProvider>
  );
}
