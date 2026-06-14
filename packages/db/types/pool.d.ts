import type { Pool, PoolClient } from 'pg'

export function createPool(): Pool
export function withTransaction<T>(
    pool: Pool,
    fn: (client: PoolClient) => Promise<T>
): Promise<T>
