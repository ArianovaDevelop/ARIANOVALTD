// src/lib/cin7.ts

/**
 * Cin7 Core (formerly DEAR Systems) API Service
 * 
 * Documentation: https://dearinventory.docs.apiary.io/
 */

const CIN7_ACCOUNT_ID = process.env.CIN7_ACCOUNT_ID;
const CIN7_API_KEY = process.env.CIN7_API_KEY;
const API_BASE_URL = 'https://inventory.dearsystems.com/ExternalApi/v2';

export interface Cin7OrderLine {
  SKU: string;
  Quantity: number;
  Price: number;
}

export interface Cin7OrderPayload {
  Customer: string;
  ShippingAddress?: {
    Line1?: string;
    Line2?: string;
    City?: string;
    State?: string;
    Postcode?: string;
    Country?: string;
  };
  Lines: Cin7OrderLine[];
  StripeSessionId: string;
}

/**
 * Wrapper for Cin7 API requests
 */
async function fetchCin7(endpoint: string, options: RequestInit = {}) {
  if (!CIN7_ACCOUNT_ID || !CIN7_API_KEY) {
    console.warn("⚠️ CIN7 credentials missing. API calls will fail or be stubbed.");
  }

  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    'api-auth-accountid': CIN7_ACCOUNT_ID || '',
    'api-auth-applicationkey': CIN7_API_KEY || '',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Cin7 API Error (${response.status}):`, errorText);
    throw new Error(`Cin7 API Error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Creates a "Simple Sales Order" in Cin7 Core
 * 
 * @param orderData Normalized order payload from Stripe/Sanity
 */
export async function createSalesOrder(orderData: Cin7OrderPayload) {
  console.log("🚀 [Cin7 Adapter] Intercepted new sales order request!");
  console.log("Payload:", JSON.stringify(orderData, null, 2));

  // TODO: Map the generic Cin7OrderPayload to the exact DEAR API structure.
  // Example mapping for DEAR V2 /SaleList endpoint:
  const dearPayload = {
    Customer: orderData.Customer,
    ShippingAddress: orderData.ShippingAddress,
    Lines: orderData.Lines,
    Memo: `Stripe Checkout: ${orderData.StripeSessionId}`,
    // Set status to Authorized or Draft based on business logic
    Status: "Draft" 
  };

  // If we have credentials, attempt the call. Otherwise, just simulate success for local dev.
  if (CIN7_ACCOUNT_ID && CIN7_API_KEY) {
    console.log("📡 Sending to Cin7 API...");
    // Uncomment when ready to test against live trial:
    // return fetchCin7('/SaleList', {
    //   method: 'POST',
    //   body: JSON.stringify(dearPayload)
    // });
    
    return { success: true, message: "Stubbed API Call (Credentials Present)" };
  } else {
    console.log("⚠️ No Cin7 credentials found. Simulating successful order creation.");
    return { success: true, simulated: true };
  }
}

/**
 * Fetches real-time stock availability for a specific SKU.
 */
export async function getAvailableStock(sku: string) {
  // TODO: Implement fetch to /ProductAvailability endpoint
  console.log(`🔍 [Cin7 Adapter] Fetching stock for SKU: ${sku}`);
  return 0;
}
