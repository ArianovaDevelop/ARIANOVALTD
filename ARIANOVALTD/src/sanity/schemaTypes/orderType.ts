import { defineField, defineType } from 'sanity'

export const orderType = defineType({
  name: 'order',
  title: 'Order History',
  type: 'document',
  fields: [
    defineField({ 
      name: 'orderNumber', 
      title: 'Order Number', 
      type: 'string',
      readOnly: true 
    }),
    defineField({ 
      name: 'stripeSessionId', 
      title: 'Stripe Session ID', 
      type: 'string',
      readOnly: true 
    }),
    defineField({ 
      name: 'customer', 
      title: 'Customer', 
      type: 'reference', 
      to: [{ type: 'customer' }],
      readOnly: true
    }),
    defineField({
      name: 'items',
      title: 'Purchased Items',
      type: 'array',
      readOnly: true,
      of: [
        {
          type: 'object',
          name: 'orderItem',
          fields: [
            { name: 'wine', title: 'Wine Reference', type: 'reference', to: [{ type: 'wine' }] },
            { name: 'event', title: 'Event Reference', type: 'reference', to: [{ type: 'event' }] },
            { name: 'quantity', type: 'number' },
            { name: 'priceAtPurchase', title: 'Price at Purchase (Cents)', type: 'number' },
            { 
              name: 'checkInCount', 
              title: 'Tickets/Items Redeemed', 
              type: 'number', 
              initialValue: 0,
              description: 'Increment this manually at the entrance for event check-ins.'
            }
          ],
          preview: {
            select: {
              wineTitle: 'wine.title',
              eventTitle: 'event.title',
              quantity: 'quantity'
            },
            prepare(selection: any) {
              const { wineTitle, eventTitle, quantity } = selection
              const title = wineTitle || eventTitle || 'Unknown Item'
              return {
                title: `${quantity}x ${title}`
              }
            }
          }
        }
      ]
    }),
    defineField({ name: 'totalAmount', title: 'Total Amount (Cents)', type: 'number', readOnly: true }),
    defineField({
      name: 'status',
      title: 'Fulfillment Status',
      type: 'string',
      options: {
        list: ['Processing', 'Shipped', 'Delivered', 'Cancelled']
      },
      initialValue: 'Processing',
      // This is the only field the admin is allowed to change manually
    })
  ],
  preview: {
    select: {
      orderNumber: 'orderNumber',
      totalAmount: 'totalAmount',
      status: 'status',
    },
    prepare(selection) {
      const { orderNumber, totalAmount, status } = selection
      
      const formattedTotal = totalAmount ? `$${(totalAmount / 100).toFixed(2)}` : '$0.00'
      const emoji = status === 'Processing' ? '⏳' : status === 'Shipped' ? '📦' : status === 'Delivered' ? '✅' : '❌'

      return {
        title: `Order #${orderNumber || 'UNKNOWN'}`,
        subtitle: `${formattedTotal} - ${emoji} ${status || 'Pending'}`
      }
    }
  }
})
