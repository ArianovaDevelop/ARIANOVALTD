/**
 * Cin7 Core (DEAR Inventory) API v2 Strict Interfaces
 * Based on the official .apib Blueprint
 */

export interface Cin7Address {
  DisplayAddressLine1?: string;
  DisplayAddressLine2?: string;
  Line1: string;
  Line2?: string;
  City: string;
  State?: string;
  Postcode: string;
  Country: string;
  Company?: string;
  Contact?: string;
}

export interface Cin7SaleOrderLine {
  SKU: string;
  Quantity: number;
  Price: number;
  Discount?: number;
  Tax?: number;
  TaxRule?: string;
  Comment?: string;
  ProductID?: string;
  Name?: string;
}

export interface Cin7SaleOrder {
  SaleOrderNumber?: string;
  Memo?: string;
  Status?: 'DRAFT' | 'AUTHORISED' | 'VOIDED';
  Lines: Cin7SaleOrderLine[];
  AdditionalCharges?: {
    Description: string;
    Price: number;
    Quantity: number;
    TaxRule: string;
    Tax?: number;
  }[];
}

export interface Cin7SalePayload {
  ID?: string; // Guid, required for PUT
  CustomerID: string; // Guid
  Customer?: string;
  Contact?: string;
  Phone?: string;
  Email?: string;
  BillingAddress?: Cin7Address;
  ShippingAddress?: Cin7Address;
  Location: string;
  Terms?: string;
  PriceTier?: string;
  ShipBy?: string; // Date ISO 8601
  Note?: string;
  CustomerReference?: string; // Often used for external IDs like stripe_session_id
  ExternalID?: string;
  SaleType?: 'Simple' | 'Advanced';
  Order?: Cin7SaleOrder;
}

export interface Cin7SaleListItem {
  SaleID: string;
  OrderNumber: string;
  Status: string;
  OrderDate: string;
  Customer: string;
  CustomerID: string;
  CustomerReference: string;
  ExternalID: string | null;
  InvoiceNumber: string | null;
  CombinedInvoiceStatus: string;
  CombinedPaymentStatus: string;
  [key: string]: any;
}

export interface Cin7SaleListResponse {
  Total: number;
  Page: number;
  SaleList: Cin7SaleListItem[];
}

export interface Cin7ProductAvailability {
  ID: string;
  SKU: string;
  Name: string;
  Location: string;
  OnHand: number;
  Allocated: number;
  Available: number;
  OnOrder: number;
  StockOnHand: number;
}

export interface Cin7ProductAvailabilityResponse {
  Total: number;
  Page: number;
  ProductAvailabilityList: Cin7ProductAvailability[];
}

export interface Cin7PaymentPayload {
  TaskID: string; // The Sale ID from the previous step
  Type?: 'PREPAYMENT' | 'PAYMENT' | 'REFUND';
  Reference?: string; // External reference — used for Stripe session ID audit trail
  Amount: number;
  DatePaid: string; // ISO 8601 Date
  Account: string; // Account Code of the bank/payment account
  CurrencyRate?: number; // Usually 1.0 for local currency
}

// --- API Implementation ---

const DEAR_API_URL = process.env.CIN7_BASE_URL || 'https://inventory.dearsystems.com/ExternalApi/v2';

const getHeaders = () => {
  const accountId = process.env.CIN7_ACCOUNT_ID;
  const apiKey = process.env.CIN7_API_KEY;
  if (!accountId || !apiKey) {
    throw new Error('FATAL: CIN7_ACCOUNT_ID or CIN7_API_KEY is not configured in the environment.');
  }
  return {
    'Content-Type': 'application/json',
    'api-auth-accountid': accountId,
    'api-auth-applicationkey': apiKey,
  };
};

/**
 * Searches for a Sales Order using the stripe_session_id.
 * Returns the matched sale order if found, so we can extract the SaleID for payments.
 */
export async function checkSalesOrderExists(stripeSessionId: string): Promise<Cin7SaleListItem | null> {
  // Defensive validation: if input is missing or invalid, return null immediately instead of throwing
  if (!stripeSessionId || typeof stripeSessionId !== 'string') {
    return null;
  }

  try {
    const params = new URLSearchParams({
      Search: stripeSessionId,
      Limit: '1'
    });

    const response = await fetch(`${DEAR_API_URL}/SaleList?${params.toString()}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Cin7 SaleList Error: ${response.statusText}`);
    }

    const data: Cin7SaleListResponse = await response.json();
    
    // Exact match check: Cin7 Search is a "contains" search, so we verify specific fields.
    // Matches ExternalID (Stripe Session ID), CustomerReference (OrderNumber), or OrderNumber.
    const match = data.SaleList.find(item => 
      item.ExternalID === stripeSessionId ||
      item.CustomerReference === stripeSessionId || 
      item.OrderNumber === stripeSessionId
    );
    
    return match || null;
  } catch (error) {
    console.error("Cin7 SaleList Check Failed:", error);
    throw error;
  }
}

/**
 * Creates a new Simple Sale in Cin7 Core.
 */
export async function createSalesOrder(payload: Cin7SalePayload): Promise<any> {
  try {
    const response = await fetch(`${DEAR_API_URL}/Sale`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        ...payload,
        Status: 'AUTHORISED' // Authorise the Sale itself
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Cin7 Create Sale Error: ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Cin7 Create Sale Failed:", error);
    throw error;
  }
}

/**
 * Authorises an Order for an existing Sale in Cin7.
 * Required before an Invoice can be created.
 */
export async function authoriseSalesOrder(saleId: string, lines?: any[]): Promise<any> {
  try {
    const response = await fetch(`${DEAR_API_URL}/Sale/Order?ID=${saleId}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        SaleID: saleId,
        Status: 'AUTHORISED',
        Lines: lines // Re-send lines to ensure the order is not "empty"
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Cin7 Authorise Order Error: ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  } catch (err: any) {
    throw err;
  }
}

/**
 * Authorises an Invoice for an existing Sale in Cin7.
 * Required before payments can be applied.
 */
export async function createSalesInvoice(saleId: string, lines?: any[]): Promise<any> {
  try {
    const today = new Date().toISOString().split('.')[0];
    const response = await fetch(`${DEAR_API_URL}/Sale/Invoice?ID=${saleId}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        SaleID: saleId,
        TaskID: saleId,
        InvoiceDate: today,
        InvoiceDueDate: today,
        Status: 'AUTHORISED',
        Lines: lines // Re-send lines to populate the invoice
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Cin7 Authorise Invoice Error: ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  } catch (err: any) {
    throw err;
  }
}

/**
 * Creates a payment against an existing Sale in Cin7.
 */
export async function createSalesPayment(payload: Cin7PaymentPayload): Promise<any> {
  try {
    const response = await fetch(`${DEAR_API_URL}/Sale/Payment`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        ...payload,
        Type: payload.Type || 'PAYMENT'
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Cin7 Create Payment Error: ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Cin7 Create Payment Failed:", error);
    throw error;
  }
}

/**
 * Fetches stock availability for a specific SKU.
 * @deprecated Use getLiveCin7Stock for checkout flows to handle multiple SKUs and proper error throwing.
 */
export async function getProductStock(sku: string): Promise<Cin7ProductAvailability | null> {
  try {
    const response = await fetch(`${DEAR_API_URL}/ref/productavailability?Sku=${sku}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) return null;

    const data: Cin7ProductAvailabilityResponse = await response.json();
    return data.ProductAvailabilityList.find(p => p.SKU === sku) || null;
  } catch (error) {
    console.error("Cin7 Stock Fetch Failed:", error);
    return null;
  }
}

/**
 * Fetches live physical stock (StockOnHand) for multiple SKUs in parallel.
 * This is used during checkout to eliminate ghost inventory.
 * Throws if the API call fails to allow for 503 fallback.
 */
export async function getLiveCin7Stock(skus: string[]): Promise<Record<string, number>> {
  const stockMap: Record<string, number> = {};
  
  // Unique SKUs only to avoid redundant API calls
  const uniqueSkus = Array.from(new Set(skus.filter(Boolean)));
  
  if (uniqueSkus.length === 0) return stockMap;

  // Fetch all SKUs in parallel. 
  // Note: Cin7 Rate Limits might be an issue if we have dozens of SKUs, 
  // but for a typical cart (1-10 items) this is the fastest way.
  await Promise.all(uniqueSkus.map(async (sku) => {
    const response = await fetch(`${DEAR_API_URL}/ref/productavailability?Sku=${sku}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cin7 Stock Fetch Failed (${response.status}): ${errorText}`);
    }

    const data: Cin7ProductAvailabilityResponse = await response.json();
    
    // Sum StockOnHand across all locations for this SKU
    const totalPhysical = data.ProductAvailabilityList
      .filter(p => p.SKU === sku)
      .reduce((sum, p) => sum + (p.StockOnHand || 0), 0);
    
    stockMap[sku] = totalPhysical;
  }));

  return stockMap;
}
