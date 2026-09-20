import { DB } from '@theseus/db'
import { sweep } from '@theseus/sim/cleanup'

/*  sweeps the sim's players out of the database.

    npm run sim:clean -- --dry          # count, delete nothing
    npm run sim:clean                   # delete, prefix sim_
    npm run sim:clean -- --prefix sim_42_   # one run only  */

const argv   = process.argv.slice(2)
const dry    = argv.includes('--dry')
const at     = argv.indexOf('--prefix')
const prefix = at < 0 ? 'sim_' : argv[ at + 1 ]

const pool = DB.create({ schema: 'projection' })

try {
    const rows = await sweep(pool, prefix, dry)

    if (!rows.length) {
        console.log('nothing to sweep for "%s"', prefix)
        process.exit(0)
    }

    console.table(rows)
    console.log('%s %d rows across %d tables, prefix "%s"',
        dry ? 'would delete' : 'deleted',
        rows.reduce((n, r) => n + r.rows, 0), rows.length, prefix)
}
finally {
    await pool.end()
}
