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

## 🧪 Quality Assurance
The platform includes a specialized test suite using **Vitest** and **React Testing Library** covering:
- Stripe Webhook Idempotency.
- Inventory Synchronization Logic.
- Cart State Management.
- Safety-net checks for missing metadata.

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
