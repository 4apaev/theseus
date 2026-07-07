/* eslint-disable camelcase */

import { Outbox           } from '@theseus/db'
import { createEmitter    } from '@theseus/kafka'
import { eventTree as EVT } from '@theseus/contracts'
import * as Uni             from '@theseus/domain'

const emit = createEmitter('market-service')

const TARGET = 100

/**
 * @description
 * stock relative to target:
 * producers sit on a surplus, consumers run dry
 */
function stockFor(station, gid) {
    if (station.produces?.[ gid ]) return TARGET + 60
    if (station.consumes?.[ gid ]) return TARGET - 60
    return TARGET
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
 * idempotent:
 * fills empty markets with stock + quotes
 * derived from the universe economy profiles,
 * publishes a price per station × good
 */
export async function seed(pool, transact) {
    const inv = await pool.query('select 1 from station_inventory limit 1')

    if (inv.rows.length)
        return false

    await transact(pool, async client => {

        for (const station of Uni.universe.nodes.values()) {
            for (const gid of Object.keys(Uni.goods)) {

                const stock = stockFor(station, gid)
                const { stid } = station
                const {
                    price_buy,
                    price_sell,
                } = quote(gid, stock, TARGET)

                await client.query(`insert into station_inventory (stid, gid, stock, target, updated) values ($1, $2, $3, $4, now())`, [ stid, gid, stock, TARGET ])
                await client.query(`insert into markets (stid, gid, price_buy, price_sell, updated) values ($1, $2, $3, $4, now())`, [ stid, gid, price_buy, price_sell ])

                await Outbox.write(client, [
                    emit(EVT.market.price.changed, {

                        aggregate_id  : stid,
                        aggregate_type: 'market',

                        payload: {
                            gid,
                            stid,
                            price_buy ,
                            price_sell,
                        },
                    }),
                ])
            }
        }
    })
    return true
}
