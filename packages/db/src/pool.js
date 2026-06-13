import pg from 'pg'
import { readEnv, requireEnv } from '@theseus/config'

export function createPool() {
    return new pg.Pool({
        host    : requireEnv('PG_HOST'),
        port    : requireEnv('PG_PORT'),
        user    : requireEnv('PG_USER'),
        password: requireEnv('PG_PASS'),
        database: requireEnv('PG_DB'),
        max     : readEnv('PG_POOL_MAX', 10),
    })
}

export async function withTransaction(pool, fn) {
    const client = await pool.connect()
    try {
        await client.query('begin')
        const result = await fn(client)
        await client.query('commit')
        return result
    }
    catch (e) {
        await client.query('rollback')
        throw e
    }
    finally {
        client.release()
    }
}
