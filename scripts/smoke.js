import net from 'node:net'

import { DB } from '@theseus/db'
import { readEnv, requireEnv } from '@theseus/config'
import { Query, decodeJson } from '@theseus/util'
import { createKafkaClient, createProducer } from '@theseus/kafka'

import {
    guid,
    waitFor,
    createPublisher,
} from '@theseus/testing'

import {
    eventTree as EVT,
    commandTree as CMD,
} from '@theseus/contracts'

import { Player }     from '@theseus/player-service'
import { Ship }       from '@theseus/ship-service'
import { Market }     from '@theseus/market-service'
import { Projection } from '@theseus/projection-service'

/*
    the phase 1 loop against the REAL broker - compose kafka + pg:

        npm run infra:up && npm run smoke

    register → starter ship → buy ore at sol.outpost →
    fly to barnards.port → sell → count the profit,
    then check the projection read models heard everything.
*/

const say = (...a) => console.log('smoke ⋮', ...a)

// ── infra must be up ─────────────────────────────────────────

const reachable = (host, port) => new Promise(done => {
    const soc = net.createConnection({ host, port })
    const end = ok => { soc.destroy(); done(ok) }
    soc.setTimeout(1500)
    soc.once('connect', () => end(true))
    soc.once('error'  , () => end(false))
    soc.once('timeout', () => end(false))
})

const kafkaHost = requireEnv('KAFKA_HOST')
const kafkaPort = requireEnv('KAFKA_PORT')

for (const [ name, host, port ] of [
    [ 'kafka'   , kafkaHost, kafkaPort ],
    [ 'postgres', requireEnv('PG_HOST'), requireEnv('PG_PORT') ],
]) {
    if (await reachable(host, port)) {
        say(`${ name } reachable at ${ host }:${ port }`)
    }
    else {
        console.error(`smoke ⋮ ${ name } unreachable at ${ host }:${ port } - run: npm run infra:up`)
        process.exit(1)
    }
}

// ── fresh economy, real client, all four services ────────────

const admin = DB.create()
await admin.query('drop schema if exists market cascade')
await admin.end()
say('market schema dropped - deterministic quotes')

const client = createKafkaClient({
    clientId: 'smoke',
    brokers : [ `${ kafkaHost }:${ kafkaPort }` ],
})

const services = []
for (const Kind of [ Player, Ship, Market, Projection ]) {
    services.push(await Kind.of({ client }).start())
    say(`${ Kind.service } up`)
}

// ── collect events straight off the broker ───────────────────

const events = []
const collector = client.subscribe({
    groupId: guid('smoke'),
    topics : [ 'events.player', 'events.wallet', 'events.ship', 'events.cargo', 'events.market' ],
    handler(msg) { events.push(decodeJson(msg.value)) },
})

const publish = createPublisher(createProducer({ client }), 'smoke')
const event   = (type, key, id) =>
    events.find(e => e.event_type === type && e.payload[ key ] === id)

const SLOW = readEnv('SMOKE_TIMEOUT', '45s')

// ── the loop ─────────────────────────────────────────────────

let failed
try {
    const handle = guid('smoke')
    say(`registering ${ handle }`)
    await publish(CMD.player.register.requested, { handle, password: 'secret' })

    const { pid } = (await waitFor(() => event(EVT.player.created, 'handle', handle), SLOW)).payload
    const { sid } = (await waitFor(() => event(EVT.ship.created, 'pid', pid), SLOW)).payload
    say(`player ${ pid.slice(0, 8) }… docked at sol.outpost with ship ${ sid.slice(0, 13) }…`)

    await publish(CMD.market.buy.requested, {
        pid, sid,
        gid           : 'ore',
        stid          : 'sol.outpost',
        quantity      : 10,
        price_unit_max: 30,
    })
    const bought = await waitFor(() =>
        events.find(e => e.event_type === EVT.trade.executed
            && e.payload.pid === pid && e.payload.side === 'buy'), SLOW)
    say(`bought 10 ore for ₢${ bought.payload.price_total } (₢${ bought.payload.price_unit }/unit)`)

    await publish(CMD.ship.travel.requested, {
        sid, pid,
        from: 'sol.outpost',
        to  : 'barnards.port',
    })
    const arrived = await waitFor(() => event(EVT.ship.arrived, 'sid', sid), SLOW)
    say(`arrived at ${ arrived.payload.stid }`)

    await publish(CMD.market.sell.requested, {
        pid, sid,
        gid           : 'ore',
        stid          : 'barnards.port',
        quantity      : 10,
        price_unit_min: 50,
    })
    const sold = await waitFor(() =>
        events.find(e => e.event_type === EVT.trade.executed
            && e.payload.pid === pid && e.payload.side === 'sell'), SLOW)
    const credited = await waitFor(() => event(EVT.wallet.credited, 'pid', pid), SLOW)

    // ── the projection heard everything ──────────────────────

    const projection = DB.create({ schema: 'projection' })
    const sql = (...a) => Query(projection)(...a).then(r => r.rows[ 0 ])

    await waitFor(async () =>
        await sql`select 1 as ok from trade_history where pid = ${ pid } and side = ${ 'sell' }`
        && await sql`select 1 as ok from players where pid = ${ pid }` // eslint-disable-next-line no-return-await
        && await sql`select 1 as ok from ships where sid = ${ sid }`, SLOW)
    await projection.end()
    say('projection read models populated - fanout fix holds')

    // ── report ────────────────────────────────────────────────

    const cost    = +bought.payload.price_total
    const revenue = +sold.payload.price_total
    const balance = +credited.payload.balance

    say(`sold 10 ore for ₢${ revenue }`)
    say(`profit ₢${ Math.round((revenue - cost) * 100) / 100 }, balance ₢${ balance }`)

    if (balance <= 1000)
        throw new Error(`trader should profit, balance ₢${ balance }`)

    say('the loop holds - interstellar arbitrage pays ✔')
}
catch (e) {
    failed = e
    console.error('smoke ⋮ FAILED -', e.message)
}
finally {
    collector.stop()
    services.forEach(s => s.stop())
    await client.stop()
}

process.exit(failed ? 1 : 0)
