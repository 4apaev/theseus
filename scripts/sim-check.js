import { DB } from '@theseus/db'
import { readEnv } from '@theseus/config'
import { check, failed } from '@theseus/sim/invariants'

/*  the invariants alone, against whatever the database holds now.
    no traffic, no sim - a real play session answers the same rules.

    npm run sim:check -- 2026-09-01     # only rows created since  */

const since = process.argv[ 2 ] ?? new Date(0).toISOString()
const pool  = DB.create({ schema: 'projection' })

try {
    const results = await check(pool, since, readEnv('STARTER_CREDITS', 1000))

    console.table(results.map(r => ({
        invariant: r.name,
        result   : r.ok ? 'pass' : r.hard ? 'FAIL' : 'known gap',
        broke    : r.broke < 0 ? 'query error' : r.broke,
    })))

    for (const r of results.filter(x => !x.ok)) {
        console.log('\n%s %s - %s', r.hard ? '✖' : '⚠', r.name, r.note)
        r.error ? console.log('   ', r.error) : console.table(r.rows)
    }
    process.exit(+!!failed(results).length)
}
finally {
    await pool.end()
}
