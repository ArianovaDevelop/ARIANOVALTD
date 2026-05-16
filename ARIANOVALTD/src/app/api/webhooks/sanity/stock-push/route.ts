import { NextResponse } from 'next/server';
import { Logger } from '@/lib/logger';

/**
 * POST /api/webhooks/sanity/stock-push
 *
 * Triggered by a Sanity webhook when a wine document's physical_stock is updated.
 * Validates the Sanity HMAC signature, then pushes the new stock level to Cin7
 * via the Stock Adjustment API — keeping both systems in sync.
 *
 * This makes Sanity Studio the single control panel for the inventory manager.
 * They never need to log into Cin7.
 */

const CIN7_BASE_URL = process.env.CIN7_BASE_URL || 'https://inventory.dearsystems.com/ExternalApi/v2';
const CIN7_LOCATION = process.env.CIN7_DEFAULT_LOCATION || 'Main Warehouse';

// --- Sanity Webhook HMAC Signature Validation ---
async function isValidSanitySignature(req: Request, body: string): Promise<boolean> {
  const secret = process.env.SANITY_WEBHOOK_SECRET;
  if (!secret) {
    Logger.error('[Stock Push] SANITY_WEBHOOK_SECRET is not configured.');
    return false;
  }

  const signature = req.headers.get('sanity-webhook-signature');
  if (!signature) return false;

  // Sanity signs with HMAC-SHA256: "t=<timestamp>,v1=<hex-digest>"
  const [tPart, v1Part] = signature.split(',');
  const timestamp = tPart?.split('=')?.[1];
  const receivedDigest = v1Part?.split('=')?.[1];
  if (!timestamp || !receivedDigest) return false;

  // Reject webhooks older than 5 minutes (replay attack protection)
  const age = Date.now() - parseInt(timestamp, 10) * 1000;
  if (age > 5 * 60 * 1000) {
    Logger.error('[Stock Push] Sanity webhook timestamp too old — possible replay attack.');
    return false;
  }

  // Recompute HMAC
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${body}`)
  );
  const computedDigest = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computedDigest === receivedDigest;
}

// --- Cin7 Stock Adjustment ---
async function pushStockToCin7(sku: string, newQuantity: number): Promise<void> {
  const accountId = process.env.CIN7_ACCOUNT_ID;
  const apiKey = process.env.CIN7_API_KEY;
  if (!accountId || !apiKey) {
    throw new Error('FATAL: CIN7_ACCOUNT_ID or CIN7_API_KEY is not configured.');
  }

  // Create and Complete the stock adjustment in one atomic POST
  const adjustmentPayload = {
    EffectiveDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    Status: 'COMPLETED',
    Account: '1400',
    UpdateOnHand: true,
    Reference: `Sanity Push: ${sku}`,
    Lines: [
      {
        SKU: sku,
        Quantity: newQuantity,
        UnitCost: 1.00,
        Location: CIN7_LOCATION,
      },
    ],
  };

  const response = await fetch(`${CIN7_BASE_URL}/stockAdjustment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-auth-accountid': accountId,
      'api-auth-applicationkey': apiKey,
    },
    body: JSON.stringify(adjustmentPayload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Cin7 stockAdjustment failed: ${JSON.stringify(err)}`);
  }
}

// --- Route Handler ---
export async function POST(req: Request) {
  let body: string;

  try {
    body = await req.text();
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  // 1. Validate Sanity signature
  const valid = await isValidSanitySignature(req, body);
  if (!valid) {
    Logger.error('[Stock Push] Invalid or missing Sanity webhook signature.');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const payload = JSON.parse(body);

    // 2. Extract fields from the Sanity document projection
    // Configure the Sanity webhook projection as: { _id, sku, physical_stock }
    const sku: string | undefined = payload?.sku;
    const newQuantity: number | undefined = payload?.physical_stock;

    if (!sku || typeof sku !== 'string' || !/^[a-zA-Z0-9_\-]{1,50}$/.test(sku)) {
      Logger.info('[Stock Push] Skipped — no valid SKU in payload.', { sku });
      return new NextResponse('No valid SKU', { status: 400 });
    }

    if (typeof newQuantity !== 'number' || newQuantity < 0) {
      Logger.info('[Stock Push] Skipped — invalid physical_stock value.', { newQuantity });
      return new NextResponse('Invalid quantity', { status: 400 });
    }

    Logger.info(`[Stock Push] Pushing stock update to Cin7 — SKU: ${sku}, NewQty: ${newQuantity}`);

    // 3. Push to Cin7
    await pushStockToCin7(sku, newQuantity);

    Logger.info(`✅ [Stock Push] Cin7 stock updated — SKU: ${sku} → ${newQuantity}`);
    return NextResponse.json({ success: true, sku, newQuantity }, { status: 200 });

  } catch (error: any) {
    // Never leak internal errors to the response body
    Logger.error('[Stock Push] Failed to push stock to Cin7', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
