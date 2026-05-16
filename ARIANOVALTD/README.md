# Arianova | Luxury Wine Distribution Portal

A bespoke, high-end B2B platform built for the digital age. Arianova connects heritage Italian estates directly with professional retail and hospitality markets through a seamless, neoclassical minimalist interface.

## 🍷 The Journey
This project has evolved into a robust commerce engine, combining high-end aesthetics with enterprise-grade stability:
- **Neoclassical Aesthetics**: A curated palette of Deep Burgundy (`#4A0404`), Antique Cream (`#F9F6EE`), and Harvest Gold (`#B8860B`).
- **Dynamic Scarcity**: Real-time inventory management powered by Sanity CMS and Cin7 Core.
- **Enterprise Integrity**: Custom idempotency logic to prevent duplicate orders and ensure data consistency across multiple platforms.

## 🛠 Technical Stack
- **Framework**: Next.js 16.2 (Turbopack) with App Router.
- **Styling**: Vanilla CSS & Tailwind 4.0 with custom luxury design tokens.
- **Auth**: Clerk (Custom B2B "Trade Account" flow).
- **CMS**: Sanity.io (Inventory, Partner Estates, Wine Archives).
- **ERP Integration**: Cin7 Core (Inventory synchronization & logistics).
- **Payments**: Stripe (Advanced metadata payloads & webhook security).
- **Email**: Resend & React Email (Automated receipts and allocation confirmations).
- **Motion**: Framer Motion for tactile, immersive transitions.

## 🚀 Key Features
- **Resilient Webhook Engine**: A custom `Integration Log` system in Sanity provides full observability into data handoffs between Stripe, Cin7, and Xero.
- **Idempotent Checkouts**: Atomic transaction records prevent double-processing of payments and inventory deductions.
- **Programmatic SEO**: Dynamically generated `sitemap.ts` and `robots.ts` for automated search engine discovery and indexing.
- **Private Cellar**: A dedicated collector's dashboard for managing allocations and viewing purchase history.
- **Automated Image Pipeline**: Sanity "Hotspot & Crop" integration to perfectly frame tall vintage bottles across all device types.

## 🧪 Quality Assurance & Operations

The platform includes a specialized test suite using **Vitest** covering the entire core business logic:
- Stripe Webhook Idempotency.
- Inventory Synchronization Logic.
- Cart State Management.
- Safety-net checks for missing metadata.

### Running Tests
```bash
npm run test
```

### 🍷 Operational CLI Tools
We have provided CLI scripts to audit and reconcile state drift between the frontend CMS and the ERP:
- **Audit Stock Drift**: Checks for discrepancies between live Cin7 levels and Sanity's cached physical stock.
  ```bash
  npm run stock:check
  ```
- **Sync Master Stock**: Manually triggers the pull of true physical levels from Cin7 Core to patch Sanity's static storefront.
  ```bash
  npm run stock:sync
  ```

### ✉️ Email Template Previewing
To run the local visual preview dashboard for the transactional HTML email templates:
```bash
npx react-email dev --dir src/emails
```
*This will launch a local dashboard at `http://localhost:3000` (or another port if 3000 is occupied), letting you view live compiled renderings of your TSX email files as you edit them.*

---

## 🔒 Soft-Locking & Recovery Architecture

To achieve zero overselling and absolute ERP ledger integrity, Arianova uses a granular, idempotent locking state machine:

1. **Authorization Gate (`POST /api/checkout`)**:
   - Bypasses Sanity's cache and queries **live physical stock** directly from Cin7.
   - Places an optimistic **soft lock** in Sanity (`committed_stock` increments) with a strict 30-minute Stripe checkout session limit.
2. **Successful Checkout (`checkout.session.completed`)**:
   - Stripe webhook commits the sale, decrements physical stock in Sanity, releases the soft lock, and pushes the order details (invoicing, customer creation, payment application) to **Cin7 Core**.
3. **Checkout Abandonment (`checkout.session.expired`)**:
   - Stripe webhook releases the soft lock in Sanity instantly. Physical stock and Cin7 remain completely untouched.
4. **Self-Healing Replay Worker (The Janitor Cron)**:
   - Evaluates pending `Integration Logs` in Sanity Studio, executing granular state transitions (`SALE_CREATED`, `ORDER_AUTHORISED`, `INVOICE_AUTHORISED`, `PAYMENT_COMPLETED`).
   - Alerts operational teams immediately via Slack if an order hits a terminal failure threshold.

---

## 🏁 Setup & Installation
1. **Clone & Install**:
   ```bash
   npm install
   ```
2. **Environment Configuration**:
   Ensure your `.env.local` contains valid keys for Clerk, Stripe, Sanity, Cin7, and Resend.
3. **Run Development**:
   ```bash
   npm run dev
   ```

---
*Created with focus on visual excellence, technical precision, and architectural resilience.*
