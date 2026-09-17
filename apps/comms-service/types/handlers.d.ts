import type { Pool, Client } from 'pg'

type Envelope = { payload: Record<string, unknown> }
type Handler = (msg: Envelope) => Promise<unknown>
type Transact = (pool: Pool, fn: (client: Client) => Promise<unknown>) => Promise<unknown>

export function shipMirrorHandlers(pool: Pool): Record<string, Handler>
export function createHandlers(pool: Pool, transact: Transact): Record<string, Handler>
export default createHandlers
