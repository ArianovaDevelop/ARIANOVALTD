import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isProtectedRoute = createRouteMatcher(['/account(.*)', '/profile(.*)', '/cellar(.*)'])
const isOnboardingRoute = createRouteMatcher(['/onboarding'])

const isWebhookRoute = createRouteMatcher(['/api/webhooks(.*)'])

export default clerkMiddleware(async (auth, req) => {
  // 0. Maintenance Mode / "Coming Soon" Enforcement
  // This redirect forces all traffic to the homepage (where ComingSoon.tsx is waiting)
  const maintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';
  const { pathname } = req.nextUrl;
  
  if (maintenanceMode && pathname !== '/' && !pathname.startsWith('/media')) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // 1. Webhook Exception
  // We need external services (like Stripe & Clerk) to hit our APIs without authentication.
  if (isWebhookRoute(req)) return; // Pass through webhooks
  
  const { userId, sessionClaims } = await auth();
  
  // 2. Custom Metadata Parsing
  // We get `sessionClaims.metadata` from Clerk to instantly know if the user finished onboarding
  // without needing a slow DB trip.
  const metadata = sessionClaims?.metadata as { hasOnboardingCompleted?: boolean } | undefined;
  const hasOnboardingCompleted = metadata?.hasOnboardingCompleted === true;
  
  // 3. Mandatory Onboarding Enforcement
  // If a user is logged in but hasn't onboarded, force them to the `/onboarding` page.
  // This blocks access to the rest of the application.
  if (userId && !hasOnboardingCompleted && !isOnboardingRoute(req)) {
      const onboardingUrl = new URL('/onboarding', req.url);
      return NextResponse.redirect(onboardingUrl);
  }

  // 4. Onboarding Loop Prevention
  // If a user has ALREADY onboarded, prevent them from accessing the `/onboarding` page again.
  // We redirect them to the home page instead.
  if (userId && hasOnboardingCompleted && isOnboardingRoute(req)) {
      const homeUrl = new URL('/', req.url);
      return NextResponse.redirect(homeUrl);
  }

  // 5. Native Clerk Protection
  // For designated secure routes (like /profile or /cellar), enforce authentication natively.
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
