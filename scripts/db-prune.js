import { DB, prune } from '@theseus/db'
import { readEnv } from '@theseus/config'

/*  deletes published outbox rows and old inbox rows, per schema.
    cron this - the 2 tables are 59% of the database's growth.

    npm run db:prune -- --dry        # count, delete nothing
    npm run db:prune -- --days 3     # a tighter window  */

const SCHEMAS = [ 'player', 'ship', 'market', 'comms', 'projection' ]

const argv = process.argv.slice(2)
const dry  = argv.includes('--dry')
const at   = argv.indexOf('--days')
const days = at < 0
    ? +readEnv('PRUNE_DAYS', 7)
    : +argv[ at + 1 ]

const rows = []

for (const schema of SCHEMAS) {
    const pool = DB.create({ schema })
    try {
        rows.push(...await prune(pool, days, dry))
    }
    finally {
        await pool.end()
    }
}

console.table(rows.filter(r => r.rows))
console.log('%s %d rows, keeping %d days',
    dry ? 'would delete' : 'deleted',
    rows.reduce((n, r) => n + r.rows, 0), days)
