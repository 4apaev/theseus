import Pt from 'node:path'
import Fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { withClient } from '@theseus/util'

const DEFAULT_DIR = fileURLToPath(new URL('../migrations', import.meta.url))

export default function migrate(pool, dir = DEFAULT_DIR) {
    return withClient(pool, async client => {
        pool.schema
        && await client.query(`create schema if not exists "${ pool.schema }"`)

        await bootstrap(client)

        const applied = await appliedMigrations(client)
        const files = await pendingFiles(dir, applied)

        for (const file of files)
            await applyMigration(client, Pt.join(dir, file), file)
    })
}

async function bootstrap(client) {
    await client.query(`
        create table if not exists schema_migrations (
            name    text primary key,
            applied timestamp default now()
        )
    `)
}

async function appliedMigrations(client) {
    const { rows } = await client.query('select name from schema_migrations')
    return new Set(rows.map(r => r.name))
}

async function pendingFiles(dir, applied) {
    const files = await Fs.readdir(dir)
    return files.filter(f => f.endsWith('.sql') && !applied.has(f)).sort()
}

async function applyMigration(client, path, name) {
    const sql = await Fs.readFile(path, 'utf8')
    await client.query('begin')
    try {
        await client.query(sql)
        await client.query('insert into schema_migrations (name) values ($1)', [ name ])
        await client.query('commit')
    }
    catch (e) {
        await client.query('rollback')
        throw e
    }
}
