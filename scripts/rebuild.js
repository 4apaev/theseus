import { DB }             from '@theseus/db'
import { isMain }         from '@theseus/config'
import { createHandlers } from '@theseus/projection-service'

/*
    truncate + replay projection-service's event_log through its own
    handler map - rebuilds every read model from scratch. stop
    projection-service first (documented, not enforced): its live
    consumer writing through the same handlers would race this replay.
*/
const TABLES = 'trade_history, cargo, ships, market_prices, wallets, players'

export async function rebuild() {
    const pool = DB.create({ schema: 'projection' })
    const replayed = await DB.transact(pool, replay)
    await pool.end()
    console.log(`rebuild ⋮ replayed ${ replayed } events`)
}

async function replay(client, sql) {
    const dispatch = createHandlers(client)

    await client.query(`truncate table ${ TABLES } cascade`)

    const { rows } = await sql`
        SELECT etype, payload
          FROM event_log
         ORDER BY received, eid
    `

    for (const { etype, payload } of rows) {
        const fx = dispatch[ etype ]
        fx && await fx({ payload })
    }
    return rows.length
}

isMain(import.meta.url) && await rebuild()
