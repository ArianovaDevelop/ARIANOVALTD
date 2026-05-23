import { NextResponse } from 'next/server';
import { writeClient } from '@/sanity/lib/write-client';
import { checkSalesOrderExists } from '@/lib/cin7';
import { Logger } from '@/lib/logger';

export async function GET(req: Request) {
  try {
    // Security Check: Verify CRON_SECRET to prevent unauthorized execution
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    
    // VULNERABILITY PATCH: Prevent "Bearer undefined" bypass if env var is missing
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    Logger.info('🚚 [Sync Delivery] Starting daily delivery sync cron job...');

    // Hobby Tier Defensive Limits: Clamp to 20 orders max to prevent Serverless timeouts.
    const query = `*[_type == "order" && status in ["Processing", "Paid"]][0...19] {
      _id,
      orderNumber,
      status
    }`;
    
    const activeOrders = await writeClient.fetch(query);

    if (!activeOrders || activeOrders.length === 0) {
      Logger.info('🚚 [Sync Delivery] No active orders require syncing.');
      return NextResponse.json({ message: 'No active orders found.', processedCount: 0 }, { status: 200 });
    }

    Logger.info(`🚚 [Sync Delivery] Found ${activeOrders.length} active orders. Processing sequentially...`);

    let updatedCount = 0;

    for (const order of activeOrders) {
      if (!order.orderNumber) continue;

      try {
        // VULNERABILITY PATCH: Prevent a single hanging request from burning the 10s Vercel timeout.
        // We wrap the check in a 2.5-second timeout. If it hangs, we catch it and move to the next order.
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Cin7 API Request Timeout')), 2500)
        );
        const cin7Order: any = await Promise.race([
          checkSalesOrderExists(order.orderNumber),
          timeoutPromise
        ]);

        if (cin7Order) {
          // Check FulfillmentStatus (Note: DEAR/Cin7 may return this directly in the SaleList item or Shipments)
          const fulfillmentStatus = cin7Order.FulfillmentStatus || cin7Order.Status; // Fallback if Status is used
          
          if (fulfillmentStatus === 'SHIPPED' || fulfillmentStatus === 'DISPATCHED') {
            Logger.info(`🚚 [Sync Delivery] Order ${order.orderNumber} is SHIPPED in Cin7. Updating Sanity...`);

            // Parse carrier/tracking keys if available in the SaleList response
            const trackingPayload = {
              carrier: cin7Order.Carrier || 'Standard Carrier',
              trackingNumber: cin7Order.TrackingNumber || 'N/A',
              shippedDate: cin7Order.ShipBy || new Date().toISOString(),
              fulfillmentStatus: fulfillmentStatus,
            };

            // Run a clean Sanity transaction patch
            await writeClient
              .patch(order._id)
              .set({ 
                status: 'Dispatched',
                trackingPayload: trackingPayload 
              })
              .commit();

            updatedCount++;
            Logger.info(`✅ [Sync Delivery] Order ${order.orderNumber} marked as Dispatched.`);
          }
        }
      } catch (orderError: any) {
        Logger.error(`❌ [Sync Delivery] Failed to sync order ${order.orderNumber}`, orderError);
        // Continue to the next order even if one fails
      }
    }

    Logger.info(`🎉 [Sync Delivery] Run complete. Updated ${updatedCount} orders to Dispatched.`);
    return NextResponse.json({ 
      message: 'Sync run complete', 
      processedCount: activeOrders.length,
      updatedCount 
    }, { status: 200 });

  } catch (error: any) {
    Logger.error('❌ [Sync Delivery] Critical failure during execution', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
