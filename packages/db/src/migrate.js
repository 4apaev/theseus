import Pt from 'node:path'
import Fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { withClient } from './query.js'

const TEST = process.env.NODE_ENV === 'test'
const DEFAULT_DIR = fileURLToPath(new URL('../migrations', import.meta.url))

export default function migrate(pool, dir = DEFAULT_DIR) {
    return withClient(pool, async client => {
        pool.schema
        && await client.query(`CREATE SCHEMA IF NOT EXISTS "${ pool.schema }"`)

        await bootstrap(client)

        const applied = await appliedMigrations(client)
        const files = await pendingFiles(dir, applied)

        for (const file of files)
            await applyMigration(client, Pt.join(dir, file), file)
    })
}

async function bootstrap(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name    text PRIMARY KEY,
            applied timestamp DEFAULT now()
        )
    `)
}

async function appliedMigrations(client) {
    const { rows } = await client.query('SELECT name FROM schema_migrations')
    return new Set(rows.map(r => r.name))
}

async function pendingFiles(dir, applied) {
    const files = await Fs.readdir(dir)
    return files.filter(f => f.endsWith('.sql') && !applied.has(f)).sort()
}

async function applyMigration(client, path, name) {
    const sql = await Fs.readFile(path, 'utf8')
    await client.query('BEGIN')
    try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [ name ])
        await client.query('COMMIT')
        TEST || console.log('[migration:ok]', path.replace(process.cwd(), ''))
    }
    catch (e) {
        await client.query('ROLLBACK')
        console.error('[migration:fail]', path.replace(process.cwd(), ''))
        throw e
    }
}
