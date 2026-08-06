/* eslint-disable camelcase */
import { Outbox              } from '@theseus/db'
import { poll                } from '@theseus/util'
import { createEmitter       } from '@theseus/kafka'
import { eventTree   as EVT  } from '@theseus/contracts'
import { universe    as Uni  } from '@theseus/domain'

import { quote } from './seed.js'

const emit = createEmitter('market-service')

/*
    living economy.
    a producer station gains stock. a consumer station loses stock.
    each station uses its own produce and consume rate, from universe.js.
    this is the first use of those rates.
    stock stays in the range [0, target * 2].
    an idle station settles at this limit and stays there.
    ------------------------------------------------------------
    interval 0 turns drift off.
    poll() always fires fx once, right away.
    stop() after start() cannot undo that first tick.
*/
export function pollDrift(pool, transact, { interval = 1000 } = {}) {
    return interval
        ? poll(driftTick, interval, pool, transact)
        : { stop() {} }
}

function driftTick(pool, transact) {
    return transact(pool, async client => {
        const events = []

        const drift = (stid, vector) => async (gid, rate) =>
            events.push(await saveDrift(client, stid, gid, vector * rate))

        for (const { stid, produces, consumes } of Uni.nodes.values()) {
            for (const [ gid, rate ] of Object.entries(produces ?? {})) await drift(stid,  1)(gid, rate)
            for (const [ gid, rate ] of Object.entries(consumes ?? {})) await drift(stid, -1)(gid, rate)
        }

        const moved = events.filter(Boolean)
        moved.length && await Outbox.write(client, moved)
        return moved.length
    })
}

// update stock, with the clamp.
// the query returns no row when stock does not change.
// a settled station stays quiet.
async function saveDrift(client, stid, gid, delta) {
    const { rows: [ row ] } = await client.query(`
        UPDATE station_inventory
           SET stock   = LEAST(GREATEST(stock + $3, 0), target * 2),
               updated = now()
         WHERE stid = $1
           AND gid = $2
           AND stock <> LEAST(GREATEST(stock + $3, 0), target * 2)
     RETURNING stock, target
    `, [ stid, gid, delta ])

    if (!row) return

    const { price_buy, price_sell } = quote(gid, row.stock, row.target)

    await client.query(`
        UPDATE markets
           SET price_buy = $3, price_sell = $4, updated = now()
         WHERE stid = $1
           AND gid = $2
    `, [ stid, gid, price_buy, price_sell ])

    return emit(EVT.market.price.changed, {
        aggregate_id  : stid,
        aggregate_type: 'market',
        payload       : { stid, gid, price_buy, price_sell },
    })
}
