import type { Pool } from 'pg'
import type { ServiceDescription } from '@theseus/config'

export const service: 'projection-service'
export function describeService(): ServiceDescription
export function createHandlers(pool: Pool): Record<string, (msg: unknown) => unknown>
