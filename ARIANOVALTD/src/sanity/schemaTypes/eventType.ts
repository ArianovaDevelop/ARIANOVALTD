import { defineField, defineType } from 'sanity'

export const eventType = defineType({
  name: 'event',
  title: 'Events & Ticketing',
  type: 'document',
  fields: [
    // Marketing & Display
    defineField({ name: 'title', title: 'Event Title', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'slug', title: 'URL Slug', type: 'slug', options: { source: 'title' } }),
    defineField({ name: 'date', title: 'Event Date & Time', type: 'datetime', validation: (Rule) => Rule.required() }),
    defineField({ name: 'location', title: 'Location', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'price', title: 'Ticket Price (in Cents)', type: 'number', description: 'Store in cents for Stripe (e.g., $150.00 = 15000). Use 0 for free events.' }),
    defineField({ name: 'description', title: 'Event Description', type: 'array', of: [{ type: 'block' }] }),
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [{ type: 'image', options: { hotspot: true } }],
    }),
    
    // Capacity & Ticketing Logic (Matches Wine Safety Net)
    defineField({ 
      name: 'physical_stock', 
      title: 'Total Capacity', 
      type: 'number', 
      initialValue: 0,
      description: 'The maximum number of tickets available for this event.'
    }),
    defineField({ 
      name: 'committed_stock', 
      title: 'Committed Tickets', 
      type: 'number', 
      initialValue: 0,
      description: 'Tickets currently locked in active Stripe checkouts.'
    }),
    defineField({ 
      name: 'sold_count', 
      title: 'Total Tickets Sold', 
      type: 'number', 
      initialValue: 0,
      readOnly: true,
      description: 'Automatically tracked by the Stripe Webhook Engine.'
    }),
  ],
  preview: {
    select: {
      title: 'title',
      date: 'date',
      physicalStock: 'physical_stock',
      committedStock: 'committed_stock',
      media: 'images.0'
    },
    prepare(selection) {
      const {title, date, physicalStock = 0, committedStock = 0, media} = selection
      
      const available = physicalStock - committedStock
      
      let subtitle = ''
      if (physicalStock <= 0 || available <= 0) {
        subtitle = '🚨 SOLD OUT'
      } else {
        subtitle = `Available Tickets: ${available} (Total: ${physicalStock})`
      }

      const formattedDate = date ? new Date(date).toLocaleString() : 'TBD'

      return {
        title: title,
        subtitle: `${formattedDate} | ${subtitle}`,
        media: media
      }
    }
  }
})
