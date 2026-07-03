import type { Pool, PoolClient } from 'pg'

export function createPool(opts?: { schema?: string }): Pool
export function withTransaction<T>(
    pool: Pool,
    fn: (client: PoolClient) => Promise<T>
): Promise<T>

declare const DB: {
    create: typeof createPool
    transact: typeof withTransaction
}
export default DB