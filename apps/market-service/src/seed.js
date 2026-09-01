/* eslint-disable camelcase */

import { Outbox           } from '@theseus/db'
import { createEmitter    } from '@theseus/kafka'
import { eventTree as EVT } from '@theseus/contracts'
import * as Uni             from '@theseus/domain'

const emit = createEmitter('market-service')

const TARGET = 100

/**
 * @description
 * the natural stock level of one station:good.
 * producers sit on a surplus, consumers run dry.
 * seed puts stock here, and drift.js brings it back here after a trade.
 * both must use this function, or drift moves stock away from seed.
 */
export function stockFor(station, gid) {
    if (station.produces?.[ gid ]) return TARGET + 60
    if (station.consumes?.[ gid ]) return TARGET - 60
    return TARGET
}

function stocksAt(station, gid) {
    return Uni.goods[ gid ].kind !== 'module' || !!station.stocks?.includes(gid)
}

export function quote(gid, stock, target) {
    const good = Uni.goods[ gid ]
    return Uni.spread(
        Uni.price(
            good.price_base,
            stock,
            target,
            good.elasticity,
        ),
    )
}

/**
 * @description
 * fills empty markets with stock + quotes
 * derived from the universe economy profiles,
 * publishes a price per station × good.
 *
 * it adds what is missing, and never touches a row that exists.
 * so a new station in the universe gets its markets on the
 * next boot, and a traded market keeps its stock.
 * returns the count of new rows.
 */
export async function seed(pool, transact) {
    const { rows } = await pool.query('SELECT stid, gid FROM station_inventory')
    const have = new Set(rows.map(r => `${ r.stid }:${ r.gid }`))

    return transact(pool, async client => {
        const fresh = []

        for (const station of Uni.universe.nodes.values()) {
            for (const gid of Object.keys(Uni.goods)) {
                stocksAt(station, gid)
                    && !have.has(`${ station.stid }:${ gid }`)
                    && fresh.push(await seedOne(client, station, gid))
            }
        }

        fresh.length && await Outbox.write(client, fresh)
        return fresh.length
    })
}

// `on conflict do nothing` guards one case only: two market services
// boot together and both read the same empty table.
async function seedOne(client, station, gid) {
    const { stid } = station
    const stock    = stockFor(station, gid)

    const {
        price_buy,
        price_sell,
    } = quote(gid, stock, TARGET)

    await client.query(`
        INSERT INTO station_inventory (stid, gid, stock, target, updated)
             VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (stid, gid)
         DO NOTHING
    `, [ stid, gid, stock, TARGET ])

    await client.query(`
        INSERT INTO markets (stid, gid, price_buy, price_sell, updated)
             VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (stid, gid)
         DO NOTHING
    `, [ stid, gid, price_buy, price_sell ])

    return emit(EVT.market.price.changed, {

        aggregate_id  : stid,
        aggregate_type: 'market',

        payload: {
            gid,
            stid,
            price_buy ,
            price_sell,
        },
    })
}
