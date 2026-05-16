import { type SchemaTypeDefinition } from 'sanity'
import { wineType } from './wineType'
import { userType } from './userType'
import { orderType } from './orderType'
import { sessionRecordType } from './sessionRecordType'
import { eventType } from './eventType'
import { siteSettingsType } from './siteSettingsType'
import { integrationLogType } from './integrationLogType'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [wineType, userType, orderType, sessionRecordType, eventType, siteSettingsType, integrationLogType],
}
