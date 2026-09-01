import test   from 'node:test'
import assert from 'node:assert/strict'

import { DB, Query } from '@theseus/db'
import * as Kfk      from '@theseus/kafka'

import {
    guid,
    collectEvents,
    createPublisher,
    wherePayload,
} from '#testing/index.js'

import startPlayer from '@theseus/player-service'
import startShip    from '@theseus/ship-service'
import startMarket  from '@theseus/market-service'

import {
    eventTree as EVT,
    commandTree as CMD,
} from '@theseus/contracts'

import { rebuild } from '../scripts/rebuild-market-ships.js'

const PRFX = 'itg_mkt_rebuild'

/*
    reproduces docs/tech.debt.md's "missing ship" bug on purpose: a
    postgres-only reset can empty market's `ships` row while its kafka
    consumer group keeps its already-committed offset, so it never
    re-consumes the ship.created/departed/arrived events that would
    refill it - a trade against that ship then rejects `ship unknown`
    forever, with no live event left to fix it. this truncates `ships`
    directly (not the whole schema) to model exactly that, without
    touching the consumer group at all.
*/

let kafka, publish, services, pool, sql

test.before(async () => {
    const admin = DB.create()
    await admin.query('drop schema if exists market cascade')
    await admin.end()

    kafka   = Kfk.createMemoryKafka()
    publish = createPublisher(Kfk.createProducer({ client: kafka }))
    pool    = DB.create({ schema: 'market' })
    sql     = Query(pool)

    services = [
        await startPlayer(kafka),
        await startShip(kafka),
        await startMarket(kafka),
    ]
})

test.after(() => {
    services?.forEach(s => s.stop())
    pool?.end()
})

async function shipRow(sid) {
    const { rows: [ row ] } = await sql`
        SELECT sid, pid, stid, status, capacity
          FROM ships
         WHERE sid = ${ sid }`
    return row
}

test('rebuild-market-ships recovers a ship wiped independently of the kafka offset', async () => {
    const handle = guid(PRFX)
    const { events, stop } = collectEvents(kafka, [ 'events.player', 'events.ship' ])

    await publish(CMD.player.register.requested, { handle, password: 'secret' })
    const created = await wherePayload(events, EVT.player.created, { handle }, '10s')
    const { pid } = created.payload

    const freebie = await wherePayload(events, EVT.ship.created, { pid }, '10s')
    const { sid } = freebie.payload

    // exercise all 3 mirror handlers, not just creation
    await publish(CMD.ship.travel.requested, { sid, pid, from: 'sol.outpost', to: 'barnards.port' })
    await wherePayload(events, EVT.ship.arrived, { sid }, '15s')
    stop()

    const before = await shipRow(sid)
    assert.ok(before, 'market mirrored the ship before anything went wrong')

    // the bug: wipe the mirror row directly - the consumer group's
    // offset is untouched, so nothing will ever refill it on its own
    await pool.query('truncate table ships cascade')
    assert.equal(await shipRow(sid), void 0, 'the row is really gone')

    const { events: rejects, stop: stopRejects } = collectEvents(kafka, [ 'events.market' ])
    await publish(CMD.market.buy.requested, {
        pid, sid,
        gid           : 'grain',
        stid          : 'barnards.port',
        quantity      : 1,
        price_unit_max: 999,
    })
    const rejected = await wherePayload(rejects, EVT.trade.rejected, { pid }, '10s')
    stopRejects()
    assert.equal(rejected.payload.reason, 'ship unknown', 'the bug reproduces: a real trade now fails')

    await rebuild()

    const after = await shipRow(sid)
    assert.deepEqual(after, before, 'the mirror row is back, identical to before the wipe')

    const { events: trades, stop: stopTrades } = collectEvents(kafka, [ 'events.market' ])
    await publish(CMD.market.buy.requested, {
        pid, sid,
        gid           : 'grain',
        stid          : 'barnards.port',
        quantity      : 1,
        price_unit_max: 999,
    })
    await wherePayload(trades, EVT.trade.executed, { pid }, '10s')
    stopTrades()
})
