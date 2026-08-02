import { DB                 } from '@theseus/db'
import { isMain, requireEnv } from '@theseus/config'
import { Fail, withClient   } from '@theseus/util'

// drops + recreates PG_DB from scratch - only ever against a disposable
// integration-test database, never the real dev one (see the guard below)
export async function globalSetup() {
    const name = requireEnv('PG_DB')
    name.endsWith('_test') || Fail.raise(
        `refusing to reset "${ name }" - PG_DB must end in _test (is .env.dev loaded?)`)

    const admin = DB.create({ database: 'postgres' })
    await withClient(admin, async client => {
        await client.query(`drop database if exists "${ name }" with (force)`)
        await client.query(`create database "${ name }" owner theseus`)
    })
    await admin.end()
    console.log(`reset ${ name }`)
}

isMain(import.meta.url) && await globalSetup()
