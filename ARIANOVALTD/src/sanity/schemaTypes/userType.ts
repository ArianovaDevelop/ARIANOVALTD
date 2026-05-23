import { defineField, defineType } from 'sanity'
import { MEMBERSHIP_TIERS } from '@/config/membership'

export const userType = defineType({
  name: 'customer',
  title: 'Customer Profile',
  type: 'document',
  fields: [
    defineField({ 
      name: 'fullName', 
      title: 'Full Name', 
      type: 'string',
      validation: (Rule) => Rule.required().error('Arianova dossiers require a formal name.')
    }),
    defineField({ 
      name: 'email', 
      title: 'Email Address', 
      type: 'string', 
      readOnly: true 
    }),
    defineField({ 
      name: 'clerkId', 
      title: 'Clerk ID', 
      type: 'string', 
      readOnly: true,
      description: 'The unique identifier synced from Clerk Authentication.'
    }),
    defineField({
      name: 'palatePreferences',
      title: 'Palate Preferences',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        list: [
          { title: 'Bold Reds', value: 'bold-reds' },
          { title: 'Light Reds', value: 'light-reds' },
          { title: 'Crisp Whites', value: 'crisp-whites' },
          { title: 'Rich Whites', value: 'rich-whites' },
          { title: 'Sparkling', value: 'sparkling' }
        ]
      }
    }),
    defineField({
      name: 'tastingFrequency',
      title: 'Tasting Frequency',
      type: 'string',
      options: {
        list: [
          { title: 'Daily Taster', value: 'daily' },
          { title: 'Weekly Explorer', value: 'weekly' },
          { title: 'Special Occasion', value: 'special-occasion' },
          { title: 'Collector', value: 'collector' }
        ]
      }
    }),
    defineField({ name: 'newsletterOptIn', title: 'Newsletter Opt-In', type: 'boolean', initialValue: false }),
    defineField({
      name: 'acquisitions',
      title: 'Acquisitions',
      type: 'number',
      initialValue: 0,
      readOnly: true
    }),
    defineField({
      name: 'tier',
      title: 'Status Tier',
      type: 'string',
      options: {
        list: Object.values(MEMBERSHIP_TIERS)
      },
      initialValue: MEMBERSHIP_TIERS.BRONZE,
      readOnly: true
    }),
  ],
  preview: {
    select: {
      title: 'fullName',
      subtitle: 'email',
    },
    prepare({ title, subtitle }) {
      return {
        title: title || 'Anonymous Connoisseur',
        subtitle: subtitle || 'Secure Dossier',
      }
    }
  }
})
