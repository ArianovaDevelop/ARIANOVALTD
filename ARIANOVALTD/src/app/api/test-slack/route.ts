import { NextResponse } from 'next/server';
import { Logger } from '@/lib/logger';

export async function GET() {
  try {
    await Logger.notifySlack(
      `🍷 *New Sale!* Order #TESTSALE has been successfully synchronized to Cin7.`,
      {
        orderNumber: 'TESTSALE',
        customer: 'Arianova Wine Enthusiast',
        amount: '$350.00',
        items: '2x 2021 Arianova Pinot Noir, 1x 2020 Arianova Chardonnay'
      }
    );
    
    return NextResponse.json({ message: 'Simulated Wine Sale notification sent to Slack!' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
