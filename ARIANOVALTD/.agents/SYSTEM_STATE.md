# AriaNova System State

This file tracks the status of integrations, design standards, and architectural drift against the guidelines in [.agents/ARCHITECTURE.md](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/.agents/ARCHITECTURE.md).

| Status | ID | Description |
| :--- | :--- | :--- |
| **[RESOLVED]** | `AN-DRIFT-001` | **Orphan Sanity-to-Cin7 Push Webhook:** Resolved. The orphan webhook route directory `src/app/api/webhooks/sanity/stock-push` has been permanently deleted, and the schema description in [wineType.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/sanity/schemaTypes/wineType.ts#L49) has been corrected to reference the pull-based sync cron job. |
| **[RESOLVED]** | `AN-DRIFT-002` | **Outdated Schema Field Description:** Resolved. In [wineType.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/sanity/schemaTypes/wineType.ts#L49), the description of `physical_stock` has been updated to reference the active daily pull-based sync cron job. |
| **[RESOLVED]** | `AN-DRIFT-003` | **Broken Pre-flight Idempotency Check:** Resolved. Stripe Session ID is now mapped to `ExternalID` during Sales Order creation, and `checkSalesOrderExists()` checks `ExternalID` for matching sales, protecting the pre-flight idempotency guard. |
| **[ALIGNED]** | `AN-ALIGNED-001` | **Vercel Cron Schedules:** Active cron jobs in [vercel.json](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/vercel.json) match the registered schedules in Section 3 of [ARCHITECTURE.md](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/.agents/ARCHITECTURE.md) perfectly (`0 2 * * *`, `0 0 * * *`, `0 4 * * *`). |
| **[ALIGNED]** | `AN-ALIGNED-002` | **Compute on Write for User States:** Membership tiers and customer acquisitions are computed on the backend inside the Stripe webhook and synced to Clerk's `publicMetadata`. |
| **[ALIGNED]** | `AN-ALIGNED-003` | **Stripe Webhook Performance:** Asynchronous background syncs (Cin7, Slack, Resend) are offloaded to Next.js 15's native `after()` API to respond to Stripe in under 500ms. |
| **[ALIGNED]** | `AN-ALIGNED-004` | **Idempotency & Master Atomic Transactions:** Transactions on Sanity CMS are performed atomically via `writeClient.transaction()`, including creation of `sessionRecord` for idempotency checks. |
| **[ALIGNED]** | `AN-ALIGNED-005` | **Shipping Charges Injection:** Shipping charges are correctly mapped as an `AdditionalCharge` with the `'Tax on Sales'` TaxRule in [stripe/route.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/api/webhooks/stripe/route.ts). |
| **[VERIFIED]** | `AN-CRON-001` | **Cron Job Schedule Check:** Confirmed 3 active cron jobs in vercel.json (/api/cron/cin7-retry, /api/cron/sync-delivery, /api/cron/sync-inventory). Schedules match ARCHITECTURE.md perfectly. |

---

## [SEO-DRIFT]

| Status | ID | Description |
| :--- | :--- | :--- |
| **[DRIFT]** | `AN-SEO-001` | **Missing Page-Specific Metadata:** Key pages like the Home page ([page.tsx](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/page.tsx)), Wines detail page ([page.tsx](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/wines/[slug]/page.tsx)), Story page ([page.tsx](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/story/page.tsx)), and Vineyard page ([page.tsx](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/vineyard/page.tsx)) do not export unique `metadata` or `generateMetadata` definitions, relying entirely on the generic root layout metadata. |
| **[DRIFT]** | `AN-SEO-002` | **Missing Product JSON-LD Schema:** The product detail page [page.tsx](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/wines/[slug]/page.tsx) lacks an embedded JSON-LD Product schema for Google rich snippets. |
| **[DRIFT]** | `AN-SEO-003` | **Heading Hierarchy Violation (H2 before H1):** Both the Homepage ([page.tsx:L36-39](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/page.tsx#L36-L39)) and Wine details page ([page.tsx:L71-75](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/wines/[slug]/page.tsx#L71-L75)) render an `h2` subheading physically and semantically above the main `h1` heading. |
| **[DRIFT]** | `AN-SEO-004` | **CSS Background Images Used for Visual Media:** The Story page ([page.tsx:L41](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/story/page.tsx#L41)) uses raw CSS background images instead of Next.js's optimized `<Image>` component, bypassing image optimization and LCP controls. |
| **[DRIFT]** | `AN-SEO-005` | **Missing Canonical Links:** No public-facing pages generate dynamic canonical tags (`<link rel="canonical">`) to protect against duplicate content indexing. |
| **[ALIGNED]** | `AN-SEO-006` | **LCP Image Priority:** The wine detail page ([page.tsx:L44](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/wines/[slug]/page.tsx#L44)) correctly applies the `priority` flag to the main product image for LCP optimization. |

---

## Resolution Audit Log

- **2026-05-24:** Resolved `AN-DRIFT-003` (Broken Pre-flight Idempotency Check). Mapped `stripe_session_id` to `ExternalID` inside [route.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/api/webhooks/stripe/route.ts) during sales order creation, and updated [checkSalesOrderExists()](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/lib/cin7.ts#L135-L163) in [cin7.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/lib/cin7.ts) to query using `ExternalID`. Mocked Next.js 15 `after()` in [stripe-webhook.test.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/tests/stripe-webhook.test.ts) to solve the async race condition in testing, and added unit tests in [cin7.test.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/tests/cin7.test.ts) to assert the resolution.
- **2026-05-24:** Resolved `AN-DRIFT-001` (Orphan Webhook Removal). Verified no active code references exist for the `src/app/api/webhooks/sanity/stock-push` directory, permanently deleted the directory, and updated the schema description in [wineType.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/sanity/schemaTypes/wineType.ts#L49) to refer to the pull-based inventory sync cron.
- **2026-05-24:** Resolved `AN-DRIFT-002` (Outdated Schema Description). Replaced legacy "Cin7 Core Webhooks" description in [wineType.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/sanity/schemaTypes/wineType.ts#L49) with references to the active daily pull-based inventory sync cron.

