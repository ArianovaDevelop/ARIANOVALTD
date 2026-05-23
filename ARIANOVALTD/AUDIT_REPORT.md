# AriaNova Architectural Audit & Drift Report

**Audit Conducted by:** Chief Architect, AriaNova  
**Date:** May 24, 2026  
**Target Repository:** `arianoavemanager-ai/Arianovaltd`  
**Reference Document:** [.agents/ARCHITECTURE.md](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/.agents/ARCHITECTURE.md)

---

## Executive Summary
This audit scans the repository (specifically `/src/app/api`, `/src/lib`, `vercel.json`, and Sanity schemas) to detect discrepancies, architectural drift, and policy violations against the authoritative [ARCHITECTURE.md](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/.agents/ARCHITECTURE.md) guidelines. 

The audit identified **one policy violation** (orphan push webhook), **one critical integration logic flaw** (pre-flight idempotency checks), and **one outdated schema description**. The Vercel cron job definitions successfully align with the registered schedules.

---

## 1. Section 6 Policy Review: "NO PUSH WEBHOOKS" & Stock Sync

### Found Drift: Orphan Sanity-to-Cin7 Push Webhook Route
* **File Path:** [route.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/api/webhooks/sanity/stock-push/route.ts)
* **Description:** This API route handles incoming webhook requests from Sanity Studio when `physical_stock` is updated and pushes these stock levels to Cin7 via the `stockAdjustment` API.
* **Architectural Discrepancy:**
  * Section 6 specifies that the legacy Cin7 stock push webhook was decomissioned and replaced by the pull-based **Inventory Sync Cron Job** (`/api/cron/sync-inventory`) because the Cin7 tier does not support outbound webhooks.
  * Section 6 establishes that Cin7 is the **authoritative source of physical stock** (which the pull cron fetches into Sanity).
  * However, this route attempts to treat Sanity Studio as the source of truth, pushing physical stock updates from Sanity back to Cin7.
  * Furthermore, in [wineType.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/sanity/schemaTypes/wineType.ts#L48), the `physical_stock` field is set to `readOnly: true`. This makes it impossible for an inventory manager to edit the field inside Sanity Studio anyway.
* **Impact:** This is dead / orphan code. If triggered programmatically, it threatens the "one-way pull" architecture, potentially creating sync conflicts or race conditions between the pull cron and the Sanity push webhook.
* **Recommendation:** Completely purge the directory `src/app/api/webhooks/sanity/stock-push` to satisfy the **NO PUSH WEBHOOKS** policy.

### Found Drift: Schema Field Description
* **File Path:** [wineType.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/sanity/schemaTypes/wineType.ts#L49)
* **Code Line:** `description: 'READ ONLY: Managed automatically by Cin7 Core Webhooks.'`
* **Architectural Discrepancy:** The schema field description points to the dead "Cin7 Core Webhooks" push model instead of referencing the active daily pull-based inventory sync cron job (`/api/cron/sync-inventory`).
* **Recommendation:** Update the schema description to read: `"READ ONLY: Managed automatically by the pull-based Cin7 Inventory Sync Cron Job."`

---

## 2. Section 3 Review: Active Vercel Cron Schedules

* **File Path:** [vercel.json](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/vercel.json)
* **Schedules Alignment:** All active cron jobs configured in `vercel.json` perfectly match the schedules registered in Section 3 of [ARCHITECTURE.md](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/.agents/ARCHITECTURE.md).

| Job Description | Route Path | Registered Schedule | Code Schedule (`vercel.json`) | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Cin7 Retry Janitor** | `/api/cron/cin7-retry` | `0 2 * * *` (2:00 AM) | `0 2 * * *` | **Aligned** |
| **Delivery Sync** | `/api/cron/sync-delivery` | `0 0 * * *` (Midnight) | `0 0 * * *` | **Aligned** |
| **Inventory Sync** | `/api/cron/sync-inventory` | `0 4 * * *` (4:00 AM) | `0 4 * * *` | **Aligned** |

* **Note:** `vercel.json` includes commented metadata fields (`//_optimalSchedule`) showing optimized hourly/half-hourly crons for a production upgrade. This is architecturally sound and does not constitute drift.

---

## 3. Section 2 Review: Dual-Reference ID System & Pre-flight Checks

### Found Drift: Broken Idempotency Safeguard in Pre-flight Check
* **File Paths:** [cin7.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/lib/cin7.ts#L135-L163) and [stripe/route.ts](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/api/webhooks/stripe/route.ts#L222-L250)
* **Architectural Discrepancy:**
  * Section 2 specifies: *"Pre-flight checking via `checkSalesOrderExists(stripeSessionId)` evaluates both fields against the incoming Stripe session identifier to prevent duplicates."*
  * However, in `stripe/route.ts` (the creation payload for Cin7 sales orders), the payload sets:
    * `CustomerReference: orderNumber` (the 8-character human-readable hex string).
    * `ExternalID` is left empty.
    * The `stripe_session_id` is only passed in the Payment `Reference` field during the final step (Payment Creation).
  * In `cin7.ts`, the `checkSalesOrderExists(stripeSessionId)` helper performs this match:
    ```typescript
    const match = data.SaleList.find(item => 
      item.CustomerReference === stripeSessionId || item.OrderNumber === stripeSessionId
    );
    ```
  * Because `stripeSessionId` (e.g. `cs_test_...`) is never assigned to `CustomerReference` (which gets the 8-char `orderNumber`) or `OrderNumber` (the Cin7 internal SO number), the check will **never find the existing Sales Order** using the Stripe checkout session ID before the payment is created.
  * In addition, `sync-delivery/route.ts` calls `checkSalesOrderExists(order.orderNumber)`. Because it passes the `orderNumber` instead of the Stripe session ID, the match succeeds (since `CustomerReference === orderNumber`). This creates naming and functional confusion where the function acts as `checkSalesOrderExistsByOrderNumber` in one cron, but is expected to act as `checkSalesOrderExistsByStripeSessionId` in the idempotency pre-flight step.
* **Impact:** If the Stripe webhook fails mid-execution (e.g., after the sale order is created in Cin7 but before the invoice or payment is applied), the **Cin7 Retry Janitor** will not be able to locate the created sale order by the Stripe checkout session ID and may attempt to create a duplicate order.
* **Recommendation:** 
  1. Store the Stripe session ID in Cin7's `ExternalID` field during Sale creation in `stripe/route.ts` and `cin7-retry/route.ts`.
  2. Update `checkSalesOrderExists` in `cin7.ts` to inspect the `ExternalID` field for `stripeSessionId` matches.
  3. Rename parameters or provide distinct helper functions for querying by `stripeSessionId` vs. `orderNumber` to remove API ambiguity.

---

## 4. Section 7 Review: Core Architectural Standards

* **1. 'Compute on Write' for User States:** **Aligned**. Customer acquisition numbers and tier badges are calculated strictly on the backend inside the Stripe webhook and synced directly to Clerk's `publicMetadata` (see [stripe/route.ts:L186-L199](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/api/webhooks/stripe/route.ts#L186-L199)).
* **2. Next.js 15 `after()` API Usage:** **Aligned**. Heavy third-party integrations (Cin7 sync, Slack ping, Resend email) in the Stripe webhook are safely pushed to the background using Next.js 15's native `after()` API to ensure response times stay well below the 500ms webhook threshold (see [stripe/route.ts:L397-L401](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/api/webhooks/stripe/route.ts#L397-L401)).
* **3. Idempotency & Master Atomic Transactions:** **Aligned**. Webhooks utilize Sanity transactions for database mutations and establish `processed-session-{id}` records (see [stripe/route.ts:L91-L180](file:///c:/Users/GGPC/Desktop/Arianova/ARIANOVALTD/src/app/api/webhooks/stripe/route.ts#L91-L180)).
* **4. Centralized Configuration:** **Aligned**. Membership tier thresholds are imported from `@/config/membership` instead of being hardcoded inline.
