import type { PoolClient, Pool } from 'pg'

export interface OutboxRecord {
    topic: string
    messages: { key?: string | null, value: Buffer | unknown }[]
}

export interface OutboxPoller {
    stop(): void
}

export function writeOutbox(client: PoolClient, records: OutboxRecord[]): Promise<void>
export function pollOutbox(
    pool: Pool,
    publish: (record: OutboxRecord) => Promise<unknown>,
    opts?: { interval?: number, batch?: number },
): OutboxPoller

declare const _default: {
    write: typeof writeOutbox
    poll : typeof pollOutbox
}
export default _default
