import { DB }               from '@theseus/db'
import { isMain }           from '@theseus/config'
import { shipMirrorHandlers } from '@theseus/market-service'

/*
    truncate + replay market-service's own `ships` mirror from its
    event_log - the scoped fix for docs/tech.debt.md's "missing ship"
    bug. unlike scripts/rebuild.js this never touches
    cargo/trades/markets/station_inventory: those are saga-owned, and
    a blanket replay would re-fire the saga's own side effects
    (wallet debits, outbox writes), not just restate a fact. `ships`
    alone is a pure, idempotent mirror - see handlers.js's
    shipMirrorHandlers for why that split is safe.

    stop market-service first (documented, not enforced): its live
    consumer writing through the same handlers would race this replay.
*/
export async function rebuild() {
    const pool = DB.create({ schema: 'market' })
    const replayed = await DB.transact(pool, replay)
    await pool.end()
    console.log(`rebuild:market-ships ⋮ replayed ${ replayed } events`)
}

async function replay(client, sql) {
    const dispatch = shipMirrorHandlers(client)

    await client.query('truncate table ships cascade')

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
