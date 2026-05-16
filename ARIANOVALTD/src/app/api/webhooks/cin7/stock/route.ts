import { NextResponse } from 'next/server';
import { writeClient } from '@/sanity/lib/write-client';
import { getProductStock } from '@/lib/cin7';
import { Logger } from '@/lib/logger';

// Secured via a dedicated custom header: x-cin7-webhook-secret
// Configure this same value in the Cin7 dashboard webhook URL settings.
export async function POST(req: Request) {
  try {
    // Security Check — Fix #1: dedicated secret, Fix #9: header instead of query param
    const secret = req.headers.get('x-cin7-webhook-secret');
    if (!secret || secret !== process.env.CIN7_WEBHOOK_SECRET) {
      Logger.error('Unauthorized Cin7 Webhook attempt');
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const payload = await req.json();

    // Fix #3: Validate and sanitise the SKU from the untrusted external payload
    const rawSku = payload?.SKU || payload?.Sku || payload?.sku;
    if (!rawSku || typeof rawSku !== 'string' || !/^[a-zA-Z0-9_\-]{1,50}$/.test(rawSku)) {
      Logger.info('Cin7 Webhook: Invalid or missing SKU.', { rawSku });
      return new NextResponse('Invalid or missing SKU', { status: 400 });
    }
    const sku = rawSku;

    Logger.info(`[Reverse Sync] Fetching live stock for SKU: ${sku} from Cin7...`);

    // 1. Fetch source of truth from Cin7 directly (do not trust webhook payload values)
    const stockData = await getProductStock(sku);

    if (!stockData) {
      Logger.info(`[Reverse Sync] SKU ${sku} not found in Cin7.`);
      return new NextResponse('SKU not found in Cin7', { status: 404 });
    }

    // 2. Find the Sanity Product by SKU — Fix #7: use singleton writeClient
    const product = await writeClient.fetch(`*[_type == "wine" && sku == $sku][0]{ _id }`, { sku });

    if (!product) {
      Logger.info(`[Reverse Sync] SKU ${sku} not found in Sanity. Cannot update.`);
      return new NextResponse('Product not found in Sanity', { status: 404 });
    }

    // 3. Patch the Sanity Product
    await writeClient
      .patch(product._id)
      .set({ physical_stock: stockData.Available })
      .commit();

    Logger.info(`✅ [Reverse Sync] Sanity updated for SKU ${sku}. New Quantity: ${stockData.Available}`);

    return NextResponse.json({ message: 'Sync successful', sku, newQuantity: stockData.Available }, { status: 200 });

  } catch (error: any) {
    // Fix #2: Never leak internal error.message to the HTTP response
    Logger.error('❌ [Reverse Sync] Failed to process Cin7 webhook', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
