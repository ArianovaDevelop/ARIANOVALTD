import { defineField, defineType } from 'sanity'

export const wineType = defineType({
  name: 'wine',
  title: 'Wine Catalog & Inventory',
  type: 'document',
  fields: [
    // Marketing & Display
    defineField({ name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'slug', title: 'URL Slug', type: 'slug', options: { source: 'title' } }),
    defineField({
      name: 'sku',
      title: 'SKU',
      type: 'string',
      validation: (Rule) => Rule.required().custom(async (sku, context) => {
        if (!sku) return true // required() handles the empty case
        const { document, getClient } = context as any
        const client = getClient({ apiVersion: '2024-03-22' })
        const existingId = await client.fetch(
          `*[_type == "wine" && sku == $sku && _id != $id][0]._id`,
          { sku, id: document._id }
        )
        return existingId ? `SKU "${sku}" is already used by another wine. SKUs must be unique across the catalog.` : true
      }),
      description: 'Must exactly match the SKU in Cin7 Core. Must be unique across all wines.',
    }),
    defineField({ name: 'winery', title: 'Winery', type: 'string', description: 'Originating estate (e.g., Tenute dello Jato)' }),
    defineField({ name: 'vintage', title: 'Vintage', type: 'number' }),
    defineField({ name: 'grapeVarieties', title: 'Grape Varieties', type: 'string' }),
    defineField({ name: 'alcoholContent', title: 'Alcohol Content', type: 'number', description: 'Alcohol by volume (%)' }),
    defineField({ name: 'price', title: 'Price (in Cents)', type: 'number', description: 'Store in cents for Stripe (e.g., $45.00 = 4500)' }),
    defineField({ name: 'unit_cost', title: 'Unit Cost (in Cents)', type: 'number', description: 'Store in cents. Used for Cin7 inventory valuation (Landed Cost).' }),
    defineField({ name: 'tastingNotes', title: 'Tasting Notes', type: 'array', of: [{ type: 'block' }] }),
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [{ type: 'image', options: { hotspot: true } }],
      description: 'ARIANOVA NOIR STYLE GUIDE: Use portrait shots with a 3:4 aspect ratio (Recommended: 1200x1600px). Background should be pure obsidian (#050505) or transparent. Ensure the bottle is centered with sharp labels and studio lighting that highlights glass curves.'
    }),
    
    // Logistics & State Management (Managed by Cin7)
    defineField({ 
      name: 'physical_stock', 
      title: 'Physical Stock', 
      type: 'number', 
      initialValue: 0,
      readOnly: true,
      description: 'READ ONLY: Managed automatically by the pull-based Cin7 Inventory Sync Cron Job.'
    }),
    defineField({ 
      name: 'committed_stock', 
      title: 'Committed Stock', 
      type: 'number', 
      initialValue: 0,
      readOnly: true,
      description: '⚠️ SYSTEM MANAGED — Do not edit. Soft locks managed automatically by the Stripe Checkout API to prevent ghost inventory. Decremented on checkout, released on session expiry, zeroed on Cin7 confirmation.'
    }),
    defineField({
      name: 'last_sync_time',
      title: 'Last Cin7 Sync',
      type: 'datetime',
      readOnly: true,
      description: 'The last time this products stock was updated from Cin7.'
    }),
    defineField({ 
      name: 'low_stock_alert', 
      title: 'Low Stock Alert Threshold', 
      type: 'number', 
      initialValue: 12 
    }),
    defineField({ 
      name: 'sold_count', 
      title: 'Total Bottles Sold', 
      type: 'number', 
      initialValue: 0,
      readOnly: true,
      description: 'Automatically tracked by the Stripe Webhook Engine.'
    }),
  ],
  preview: {
    select: {
      title: 'title',
      physicalStock: 'physical_stock',
      committedStock: 'committed_stock',
      media: 'images.0'
    },
    prepare(selection) {
      const {title, physicalStock = 0, committedStock = 0, media} = selection
      
      const available = physicalStock - committedStock
      
      let subtitle = ''
      if (physicalStock <= 0 || available <= 0) {
        subtitle = '🚨 OUT OF STOCK'
      } else {
        subtitle = `Available to Sell: ${available} (Physical: ${physicalStock})`
      }

      return {
        title: title,
        subtitle: subtitle,
        media: media
      }
    }
  }
})
