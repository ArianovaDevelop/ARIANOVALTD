# 🍷 Arianova Pre-Launch Checklist
---

## 🔐 Security & Secrets
- [x] Replace `CIN7_DEFAULT_CUSTOMER_ID` null UUID → `d5cc724a...` (Arianova Web Sales)
- [ ] **Rotate `CRON_SECRET`** — current value `super_secret_janitor_key_123` is too weak. Generate a strong one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Update in `.env.local` AND Vercel env vars.
- [x] All security hardening fixes applied (10 audit issues resolved)
- [x] No plain-text passwords in `.env.local`

---

## ⚙️ Environment Variables (Vercel Dashboard)
Make sure ALL of these are set in Vercel → Settings → Environment Variables:

- [x] `CIN7_ACCOUNT_ID`
- [x] `CIN7_API_KEY`
- [x] `CIN7_DEFAULT_CUSTOMER_ID` = `d5cc724a-3f88-49d5-85f5-180253a56180`
- [x] `CIN7_DEFAULT_LOCATION` = `Main Warehouse`
- [x] `CIN7_BASE_URL`
- [x] `SANITY_WRITE_TOKEN`
- [x] `STRIPE_SECRET_KEY`
- [x] `STRIPE_WEBHOOK_SECRET`
- [x] `CRON_SECRET` ← rotate before launch (see above)
- [x] `CLERK_SECRET_KEY`
- [x] `CLERK_WEBHOOK_SECRET`
- [x] `RESEND_API_KEY`
- [x] `ENABLE_EMAILS`
- [ ] `CIN7_STRIPE_ACCOUNT_NAME` — **Xero Clearing Account** (e.g. `"Stripe Clearing"`). Set this to the target Clearing Account name in your Chart of Accounts to balance payments. Defaults to `"1201"` with a warning log if left empty.
- [ ] `NEXT_PUBLIC_APP_URL` — Confirm this is your production domain (arianova.com), not localhost.
- [ ] `NEXT_PUBLIC_SANITY_DATASET` — Confirm this is set to `production`. (The app now defaults to `production` if left blank or set to `false`).
- [ ] `STRIPE_WEBHOOK_SECRET` — **CRITICAL**: This is unique for every URL. Ensure the Vercel secret matches the specific endpoint secret in the Stripe Dashboard.

---

## 🔗 External Service Configuration

### Stripe
- [ ] **Register Webhook URLs** for EVERY environment in Stripe Dashboard → Developers → Webhooks:
  - **Local**: Forward via `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
  - **Preview**: `https://YOUR-PREVIEW-ID.vercel.app/api/webhooks/stripe`
  - **Production**: `https://arianova.com/api/webhooks/stripe`
- [ ] Select Events: `checkout.session.completed`, `checkout.session.expired`
- [ ] Confirm `STRIPE_WEBHOOK_SECRET` in Vercel settings matches the correct destination secret.

### Clerk
- [ ] **Allowed Redirect URLs**: Add your Vercel Preview and Production URLs to Clerk Dashboard → Paths → "Redirect URLs" to prevent login blocks.

### Resend (Emails)
- [ ] **Dynamic URL Verification**: Confirm `src/lib/urls.ts` is using `getAppUrl()` in `ReceiptEmail.tsx` so customers aren't sent to `localhost:3000` from their phones.

### Sanity
- [ ] **Create webhook** in sanity.io → Project → API → Webhooks:
  - URL: `https://yourdomain.com/api/webhooks/sanity/stock-push`
  - Filter: `_type == "wine"`
  - Projection: `{_id, sku, physical_stock}`
  - Trigger: **Update only** (no Drafts, no Versions)
  - Secret: `a847420dfe438f461dc4a46cc8ffd5c02014872854da69c435837e7d034d02ca`
- [ ] Change dataset from `development` → `production` (or confirm `development` is intentional)

### Cin7
- [ ] Confirm `Main Warehouse` location is where all stock lives
- [ ] Confirm all wine products have correct SKUs matching Sanity `sku` field
- [ ] Run `npm run stock:sync` one final time to baseline Sanity stock from Cin7
- [ ] **Reset/Zero Test Stock (If Seeding Fresh)**: If you need to clear test inventory counts from Cin7 before going live:
  1. Navigate to **Inventory → Stocktake** in Cin7 Core dashboard and click **New Stocktake**.
  2. Start a Stocktake for the `Main Warehouse` location.
  3. Set all SKU quantities to `0` (either manually or via Export/Import CSV) and authorize/complete the transaction.
  4. Once Cin7 stock is cleared to zero, execute `npm run stock:cin7` to push the baseline counts from Sanity!

---

## 🧪 Integration Testing (do a test purchase)
- [ ] Make a **test purchase** with Stripe test card `4242 4242 4242 4242`
- [ ] Confirm `integrationLog` in Sanity shows `status: success` for Cin7
- [ ] Confirm order appears in Cin7 under "Arianova Web Sales" customer with correct SKU
- [ ] Confirm `committed_stock` decreases in Sanity after purchase
- [ ] Confirm receipt email fires (check inbox + Resend dashboard)
- [ ] Make a **test abandoned cart** — confirm `committed_stock` releases after 30 min session expiry

### Inventory Sync Test
- [ ] Edit `physical_stock` on a wine in Sanity Studio → hit Publish
- [ ] Confirm Sanity → Cin7 stock push fires (check Vercel logs)
- [ ] Confirm new stock level appears in Cin7 ProductAvailability

---

## 🚀 Deployment
- [ ] Merge `feature/cin7-integration` → `main` (or your production branch)
- [ ] Confirm Vercel build passes with zero errors
- [ ] Confirm cron job appears in Vercel Dashboard → Settings → Cron Jobs (runs daily at 2am UTC)
- [ ] **Upgrade Vercel plan if faster cron retries needed** — Hobby = once/day, Pro = every minute

---

## 📋 Operational Readiness
- [x] Inventory manager trained on editing `physical_stock` in Sanity Studio
- [x] Inventory manager knows **not to adjust stock directly in Cin7** (Sanity is the control panel)
- [ ] **Order Status Management**: Train fulfillment team to manually update Sanity Order status:
    1. Open Sanity Studio.
    2. Navigate to `Recent Sales`.
    3. Locate the order after shipping from Cin7.
    4. Change `Fulfillment Status` to `Shipped`.
- [x] Manual cron trigger documented — if a Cin7 order fails and you need immediate retry:
  ```bash
  GET https://yourdomain.com/api/cron/cin7-retry
  Authorization: Bearer <CRON_SECRET>
  ```
- [ ] **Cin7-to-Sanity Audit**: Perform weekly manual check to ensure Stripe, Sanity, and Cin7 totals match perfectly.

---
*Arianova Estate — Production Readiness Protocol*
