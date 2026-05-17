# Arianova — Restaurant Wholesale Account Onboarding

**For internal use by the Arianova accounts team.**
Complete both parts below for every new restaurant wholesale account.

---

## PART 1 — Restaurant Intake Form
*Send this section to the restaurant to complete. All fields are required unless marked optional.*

---

### A. Business Details

| Field | Answer |
|---|---|
| Legal Business Name | |
| Trading Name (if different) | |
| GST / NZBN Number | |
| Physical Address (Delivery) | |
| Billing Address (if different) | |
| City & Postcode | |

---

### B. Primary Contact (Accounts Payable)

| Field | Answer |
|---|---|
| Full Name | |
| Job Title | |
| Email Address | |
| Phone Number | |

---

### C. Online Account (Arianova Website)

> The restaurant must create an account on **arianova.co.nz** before they can be activated as a wholesale buyer. Ask them to complete this step first.

| Field | Answer |
|---|---|
| Have you registered on arianova.co.nz? | Yes / No |
| Email address used to register | |

---

### D. Order Preferences

| Field | Answer |
|---|---|
| Preferred delivery day(s) | e.g. Tuesday / Thursday |
| Minimum order quantity preference *(optional)* | e.g. 1 case (12 bottles) |
| Any wines of particular interest? *(optional)* | |

---

### E. Bank Account (for our records — outgoing payments to us)

> *Restaurants pay Arianova via bank transfer. Please confirm your bank details for our invoice remittance reference.*

| Field | Answer |
|---|---|
| Bank Name | |
| Account Name | |
| Account Number | |

---
---

## PART 2 — Accountant Setup Checklist
*Complete all three steps below after receiving the filled-in intake form.*

---

### STEP 1 — Create the Customer in Cin7 Core (DEAR)

> **Login:** [inventory.dearsystems.com](https://inventory.dearsystems.com)

1. Go to **Contacts → Customers → New Customer**
2. Fill in the following fields:

| Cin7 Field | Use from Intake Form |
|---|---|
| Customer Name | Legal Business Name |
| Contact Name | Primary Contact Full Name |
| Email | Accounts Payable Email |
| Phone | Phone Number |
| Billing Address | Billing Address |
| Shipping Address | Physical Delivery Address |
| **Payment Terms** | **Set to: `30 Days`** |
| Tax Rule | Tax on Sales |
| Currency | NZD |

3. Click **Save**.
4. Open the customer record that was just created.
5. Copy the **Customer ID** from the URL bar — it will look like this:
   ```
   https://inventory.dearsystems.com/Customer#/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
   The part after `#/` is the Customer ID (a long string of letters and numbers).

6. **Paste the Customer ID somewhere safe** — you will need it in Step 3.

---

### STEP 2 — Activate Their Wholesale Status in Clerk

> **Login:** [dashboard.clerk.com](https://dashboard.clerk.com) → Select the Arianova application

1. Go to **Users** and search for the email address the restaurant used to register on arianova.co.nz.
2. Click on their user profile.
3. Scroll down to **Public Metadata** and click **Edit**.
4. Add the following:
   ```json
   {
     "isWholesale": true
   }
   ```
5. Click **Save**.

> ⚠️ If the restaurant has **not yet registered** on the website, stop here and ask them to do so first. Do not proceed until their account exists.

---

### STEP 3 — Link Their Account in Sanity (CMS)

> **Login:** [arianova.sanity.studio](https://arianova.sanity.studio) (or the studio URL provided by the developer)

1. Go to **Customer Profiles** in the left sidebar.
2. Search for the restaurant's name or registered email address.
3. Open their customer record.
4. Fill in the following fields:

| Sanity Field | Value |
|---|---|
| **Is Wholesale Account** | ✅ Toggle ON |
| **Cin7 Customer ID** | Paste the Customer ID copied from Step 1 |
| **Billing Terms** | `30 Days` |

5. Click **Publish**.

---

### STEP 4 — Confirm & Notify

Once all three steps are complete:

- [ ] Customer exists in **Cin7** with Terms: 30 Days
- [ ] User account in **Clerk** has `isWholesale: true`
- [ ] Customer record in **Sanity** has Cin7 ID linked and wholesale toggled on
- [ ] Send the restaurant a confirmation email letting them know their trade account is active and they can log in to arianova.co.nz to place orders on account

**Suggested confirmation email:**

> Subject: Your Arianova Trade Account is Now Active
>
> Hi [Name],
>
> Great news — your wholesale trade account with Arianova is now active.
>
> You can log in at **arianova.co.nz** using your registered email address. Once logged in, you will see your trade pricing across our full catalog. At checkout, simply select **"Pay on Account"** to place your order on 30-day payment terms.
>
> A tax invoice will be generated automatically with our bank account details. Payment is due within 30 days of the invoice date.
>
> Please don't hesitate to get in touch if you have any questions.
>
> Warm regards,
> Arianova Estate

---

## Reference — Field Mapping Summary

| Information | Where it lives |
|---|---|
| Customer payment terms (30 Days) | Cin7 Core → Customer Record |
| Wholesale pricing per bottle | Sanity CMS → Wine Catalog (set by Arianova team) |
| Wholesale account activation flag | Clerk Dashboard + Sanity Customer Profile |
| Cin7 Customer ID (links orders to the right account) | Sanity CMS → Customer Profile |
| Order invoices & accounts receivable | Cin7 Core (auto-generated on each order) |
