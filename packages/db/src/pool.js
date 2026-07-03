import pg from 'pg'
import { withClient } from '@theseus/util'
import { readEnv, requireEnv } from '@theseus/config'

export function createPool({ schema } = {}) {
    const pool = new pg.Pool({
        host    : requireEnv('PG_HOST'),
        port    : requireEnv('PG_PORT'),
        user    : requireEnv('PG_USER'),
        password: requireEnv('PG_PASS'),
        database: requireEnv('PG_DB'),
        max     : readEnv('PG_POOL_MAX', 10),
        options : schema && `-c search_path=${ schema }`,
    })
    pool.schema = schema
    return pool
}

export function withTransaction(pool, fn) {
    return withClient(pool, async client => {
        await client.query('begin')
        try {
            const result = await fn(client)
            await client.query('commit')
            return result
        }
        catch (e) {
            await client.query('rollback')
            throw e
        }
    })
}

export default {
    create  : createPool,
    transact: withTransaction,
}
