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
  Reference?: string;
  Amount: number;
  DatePaid: string; // ISO 8601 Date
  Account: string; // Account Code of the bank/payment account
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
    
    // Exact match check: Cin7 Search is a "contains" search, so we verify the specific field.
    const match = data.SaleList.find(item => 
      item.CustomerReference === stripeSessionId || item.OrderNumber === stripeSessionId
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
      body: JSON.stringify(payload),
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
 */
export async function getProductStock(sku: string): Promise<Cin7ProductAvailability | null> {
  try {
    const params = new URLSearchParams({ Sku: sku });
    const response = await fetch(`${DEAR_API_URL}/ProductAvailability?${params.toString()}`, {
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
