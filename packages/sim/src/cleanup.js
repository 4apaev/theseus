import { Fail } from '@theseus/util'

/*
    the sim leaves players behind, and every one of them owns a ship that
    `traffic` then returns forever. this sweeps them out by handle.

    scope: rows that belong to a player whose handle starts with the
    prefix. real players never carry it. a sim player is
    `sim_<seed>_<n>`, so the default prefix catches every run.

    the write models go for good. the projection rows come back if
    anyone replays the log, because kafka still holds the events - see
    the note in the readme.
*/

/*  this file keeps pool.query(). db/query.js's sql`` tag turns every
    ${} into a placeholder, and a placeholder can never be a table or a
    column name - so a sweep built from a table list cannot use it.  */

// children first: a row that points at a ship goes before the ship
const SWEEP = [
    [ 'market.cargo',              'sid' ],
    [ 'projection.cargo',          'sid' ],
    [ 'ship.fitted_modules',       'sid' ],
    [ 'projection.fitted_modules', 'sid' ],
    [ 'ship.module_operations',    'pid' ],
    [ 'market.trades',             'pid' ],
    [ 'projection.trade_history',  'pid' ],
    [ 'comms.messages',            'pids' ],
    [ 'projection.messages',       'pids' ],
    [ 'comms.ships',               'sid' ],
    [ 'market.ships',              'sid' ],
    [ 'projection.ships',          'sid' ],
    [ 'ship.ships',                'sid' ],
    [ 'player.wallet_transactions', 'pid' ],
    [ 'player.wallets',            'pid' ],
    [ 'projection.wallets',        'pid' ],
    [ 'projection.players',        'pid' ],
    [ 'player.players',            'pid' ],
]

const PIDS  = 'SELECT pid FROM player.players WHERE handle LIKE $1'
const SIDS  = `SELECT sid FROM ship.ships WHERE pid IN (${ PIDS })`

/**
 * @param  { import('pg').Pool } pool
 * @param  { string  } prefix - handle prefix, `sim_` by default
 * @param  { boolean } dry    - count the rows, delete nothing
 * @return { Promise<{ table: string, rows: number }[]> }
 */
export async function sweep(pool, prefix = 'sim_', dry = false) {
    prefix?.length >= 3 || Fail.raise(
        `refusing to sweep on prefix "${ prefix }" - 3 characters at least`)

    const like = prefix + '%'
    const out  = []

    /*  one snapshot of the ids, taken before the first delete. reading
        them per table would come up empty once players go.  */
    const ids = await pool.query(`SELECT array(${ PIDS }) AS pids, array(${ SIDS }) AS sids`, [ like ])
    const { pids, sids } = ids.rows[ 0 ]

    if (!pids.length) return out

    for (const [ table, key ] of SWEEP) {
        // a message names 2 players, and either one makes it the sim's
        const where = key === 'pids'
            ? '"from" = ANY($1) OR "to" = ANY($1)'
            : `${ key } = ANY($1)`

        const list = key === 'sid' ? sids : pids
        const sql  = dry
            ? `SELECT count(*)::int AS n FROM ${ table } WHERE ${ where }`
            : `WITH gone AS (DELETE FROM ${ table } WHERE ${ where } RETURNING 1)
               SELECT count(*)::int AS n FROM gone`

        const { rows: [ row ] } = await pool.query(sql, [ list ])
        row.n && out.push({ table, rows: row.n })
    }

    /*  the projection's own log. it mirrors kafka, so a replay refills
        it - this only stops it from bloating between runs.  */
    const log = dry
        ? `SELECT count(*)::int AS n FROM projection.event_log WHERE payload->>'pid' = ANY($1)`
        : `WITH gone AS (DELETE FROM projection.event_log WHERE payload->>'pid' = ANY($1) RETURNING 1)
           SELECT count(*)::int AS n FROM gone`

    const { rows: [ row ] } = await pool.query(log, [ pids ])
    row.n && out.push({ table: 'projection.event_log', rows: row.n })

    return out
}
