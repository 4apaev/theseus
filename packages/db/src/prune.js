import { Fail } from '@theseus/util'

/*
    inbox and outbox both grow forever. neither is a record of anything
    once its job ends:

    - an outbox row is a publish that already happened. `published`
      carries the time it went out.
    - an inbox row is a guard against a duplicate. it stops being useful
      when the broker can no longer redeliver the event.

    so both take a retention window, and the window belongs to the
    operator. keep it longer than the broker's own retention.

    an unpublished outbox row is never touched. it is work in hand.
*/

const TABLES = [ 'inbox', 'outbox' ]

/**
 * @param  { import('pg').Pool } pool - a pool bound to one service schema
 * @param  { number  } days - keep rows this new, delete the rest
 * @param  { boolean } dry  - count them, delete nothing
 * @return { Promise<{ table: string, rows: number }[]> }
 */
export async function prune(pool, days = 7, dry = false) {
    days >= 1 || Fail.raise(`refusing to prune with a ${ days } day window - 1 day at least`)

    const out = []

    for (const table of TABLES) {
        // outbox keeps anything still waiting to go out
        const where = table === 'outbox'
            ? `published IS NOT NULL AND published < now() - $1::interval`
            : `created < now() - $1::interval`

        const sql = dry
            ? `SELECT count(*)::int AS n FROM ${ table } WHERE ${ where }`
            : `WITH gone AS (DELETE FROM ${ table } WHERE ${ where } RETURNING 1)
               SELECT count(*)::int AS n FROM gone`

        const { rows: [ row ] } = await pool.query(sql, [ `${ days } days` ])
        out.push({ table: `${ pool.schema }.${ table }`, rows: row.n })
    }
    return out
}
