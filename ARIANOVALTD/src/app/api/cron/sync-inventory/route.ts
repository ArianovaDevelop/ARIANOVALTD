import { NextResponse } from 'next/server';
import { writeClient } from '@/sanity/lib/write-client';
import { getLiveCin7Stock } from '@/lib/cin7';
import { Logger } from '@/lib/logger';

export async function GET(req: Request) {
  try {
    // Security Check: Verify CRON_SECRET to prevent unauthorized execution
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    
    // Prevent "Bearer undefined" bypass if env var is missing
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    Logger.info('📦 [Sync Inventory] Starting daily physical stock sync cron job...');

    // Hobby Tier Defensive Limits: Clamp to 20 wines max to prevent Serverless timeouts.
    // We assume a boutique wine catalog fits comfortably under this batch size.
    const query = `*[_type == "wine" && defined(sku)][0...19] {
      _id,
      sku,
      physical_stock
    }`;
    
    const activeWines = await writeClient.fetch(query);

    if (!activeWines || activeWines.length === 0) {
      Logger.info('📦 [Sync Inventory] No active wines found in Sanity requiring sync.');
      return NextResponse.json({ message: 'No active wines found.', processedCount: 0 }, { status: 200 });
    }

    Logger.info(`📦 [Sync Inventory] Found ${activeWines.length} wines. Fetching authoritative stock from Cin7...`);

    // Extract all unique SKUs to pass to Cin7
    const skus = activeWines.map((wine: any) => wine.sku).filter(Boolean);

    // VULNERABILITY PATCH: Prevent hanging Cin7 requests from burning the 10s Vercel timeout.
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Cin7 API Request Timeout')), 5000) // Generous 5s for batch fetch
    );

    let stockMap: Record<string, number>;
    try {
      stockMap = await Promise.race([
        getLiveCin7Stock(skus),
        timeoutPromise
      ]) as Record<string, number>;
    } catch (networkError: any) {
      Logger.error('❌ [Sync Inventory] Failed to fetch stock matrix from Cin7 due to network or timeout error', networkError);
      return new NextResponse('Cin7 Upstream Error', { status: 502 });
    }

    let updatedCount = 0;

    // Process sequential patching only for wines whose physical stock has explicitly changed
    for (const wine of activeWines) {
      const cin7Stock = stockMap[wine.sku];

      // If stock exists in Cin7 and differs from Sanity's ghost inventory base
      if (cin7Stock !== undefined && cin7Stock !== wine.physical_stock) {
        try {
          Logger.info(`📦 [Sync Inventory] SKU ${wine.sku} drift detected. Cin7: ${cin7Stock} | Sanity: ${wine.physical_stock}. Patching...`);

          // Execute a clean, isolated Sanity patch transaction
          await writeClient
            .patch(wine._id)
            .set({ physical_stock: cin7Stock })
            .commit();

          updatedCount++;
          Logger.info(`✅ [Sync Inventory] SKU ${wine.sku} correctly aligned to ${cin7Stock}.`);
        } catch (patchError: any) {
          Logger.error(`❌ [Sync Inventory] Failed to patch Sanity for SKU ${wine.sku}`, patchError);
          // Loop intentionally continues to next item to isolate failures
        }
      }
    }

    Logger.info(`🎉 [Sync Inventory] Run complete. Evaluated ${activeWines.length} SKUs, aligned ${updatedCount} out-of-sync wines.`);
    return NextResponse.json({ 
      message: 'Inventory Sync run complete', 
      processedCount: activeWines.length,
      updatedCount 
    }, { status: 200 });

  } catch (error: any) {
    Logger.error('❌ [Sync Inventory] Critical failure during execution', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
