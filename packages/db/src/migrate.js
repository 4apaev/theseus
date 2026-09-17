import Pt from 'node:path'
import Fs from 'node:fs/promises'

import { createHash    } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { Fail       } from '@theseus/util'
import { withClient } from './query.js'

const TEST = process.env.NODE_ENV === 'test'
const DEFAULT_DIR = fileURLToPath(new URL('../migrations', import.meta.url))

export default function migrate(pool, dir = DEFAULT_DIR) {

    return withClient(pool, async client => {

        pool.schema && await client.query(`CREATE SCHEMA IF NOT EXISTS "${ pool.schema }"`)
        await bootstrap(client)
        const applied = await getApplied(client)

        for (const name of await read(dir)) {

            const path = Pt.join(dir, name)
            const sql = await Fs.readFile(path, 'utf8')
            const sum = checksum(sql)
            await (applied.has(name)
                ? verify(client, name, sum, applied.get(name))
                : apply(client, path, sql, sum))
        }
    })
}

/*
    CREATE TABLE makes the table on a new database.
    ALTER TABLE adds the checksum column to an old database.
*/
async function bootstrap(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name     text PRIMARY KEY,
            checksum text,
            applied  timestamp DEFAULT now()
        );
        ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text;
    `)
}

async function getApplied(client) {
    const { rows } = await client.query('SELECT name, checksum FROM schema_migrations')
    return new Map(rows.map(r => [ r.name, r.checksum ]))
}

async function read(dir) {
    const files = await Fs.readdir(dir)
    return files.filter(f => f.endsWith('.sql')).sort()
}

function checksum(sql) {
    return createHash('sha256').update(sql).digest('hex')
}

/*
    a row with no checksum comes from an old database.
    migrate takes the file on disk as the baseline.
*/
function verify(client, name, next, prev) {

    if (prev == null) {
        return client.query(`
        UPDATE schema_migrations
           SET checksum = $1
         WHERE name = $2
    `, [ next, name ])
    }
    return Fail.ok(prev === next, `migration "${ name }" changed after it was applied`)
}

async function apply(client, path, sql, sum) {

    const name = Pt.basename(path)
    await client.query('BEGIN')

    try {

        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [ name, sum ])

        await client.query('COMMIT')
        TEST || console.log('[migration:ok]', path.replace(process.cwd(), ''))
    }
    catch (e) {

        await client.query('ROLLBACK')
        console.error('[migration:fail]', path.replace(process.cwd(), ''))
        throw e
    }
}
