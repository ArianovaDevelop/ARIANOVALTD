import { defineField, defineType } from 'sanity'
import { ActivityIcon } from '@sanity/icons'

export const integrationLogType = defineType({
  name: 'integrationLog',
  title: 'Integration Logs',
  type: 'document',
  icon: ActivityIcon,
  fields: [
    defineField({
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'service',
      title: 'Service',
      type: 'string',
      options: {
        list: [
          { title: 'Cin7 Core', value: 'cin7' },
          { title: 'Stripe', value: 'stripe' },
          { title: 'Xero', value: 'xero' },
          { title: 'Resend (Email)', value: 'resend' },
        ],
      },
      readOnly: true,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Success', value: 'success' },
          { title: 'Failed', value: 'failed' },
          { title: 'Pending', value: 'pending' },
        ],
      },
      readOnly: true,
    }),
    defineField({
      name: 'errorMessage',
      title: 'Error Message',
      type: 'text',
      readOnly: true,
    }),
    defineField({
      name: 'payload',
      title: 'Data Payload',
      type: 'text',
      description: 'The JSON data sent to the service (for debugging).',
      readOnly: true,
    }),
    defineField({
      name: 'timestamp',
      title: 'Timestamp',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'orderNumber',
      subtitle: 'service',
      status: 'status',
    },
    prepare({ title, subtitle, status }) {
      const statusIcon = status === 'success' ? '✅' : '❌';
      return {
        title: `${statusIcon} Order ${title || 'N/A'}`,
        subtitle: `${subtitle.toUpperCase()} | ${status.toUpperCase()}`,
      }
    },
  },
})
