import pg from 'pg'
import { Query, withClient   } from '@theseus/util'
import { readEnv, requireEnv } from '@theseus/config'

/*  pg's default parser for `timestamp` (no tz, oid 1114) reads the naive
    digits using the driver process's LOCAL timezone. every service writes
    these columns via `new Date().toISOString()` (always utc), so on a
    non-utc host the round trip silently shifts every value by the host's
    utc offset. force utc interpretation - matches what's actually stored */
pg.types.setTypeParser(1114, str => new Date(str + 'Z'))

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
            const result = await fn(client, Query(client))
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
