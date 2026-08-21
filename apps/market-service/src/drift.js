/* eslint-disable camelcase */
import { Outbox              } from '@theseus/db'
import { poll                } from '@theseus/util'
import { createEmitter       } from '@theseus/kafka'
import { eventTree   as EVT  } from '@theseus/contracts'
import { universe    as Uni  } from '@theseus/domain'

import { quote, stockFor } from './seed.js'

const emit = createEmitter('market-service')

/*
    living economy.
    every station:good has a natural stock level, from seed.js stockFor:
    a producer sits on a surplus, a consumer runs dry.

    drift is a restoring force. a trade moves stock away from that level.
    drift brings it back, at the station's own produce or consume rate.
    it never pushes stock past the level.

    an earlier version drifted to the limits 0 and target * 2, and stopped
    there. a consumer station then held 0 stock, and
    price = base * (target / max(stock, 1)) ** elasticity gave 100 ** elasticity
    times the base price - void spice reached 99000 credits.
*/
export function pollDrift(pool, transact, { interval = 1000 } = {}) {
    return interval
        ? poll(driftTick, interval, pool, transact)
        : { stop() {} }     // interval 0 turns drift off. poll() always fires once.
}

function driftTick(pool, transact) {
    return transact(pool, async client => {
        const events = []

        for (const station of Uni.nodes.values()) {
            for (const [ gid, rate ] of goodsOf(station))
                events.push(await driftOne(client, station, gid, rate))
        }

        const moved = events.filter(Boolean)
        moved.length && await Outbox.write(client, moved)
        return moved.length
    })
}

// the goods a station makes or uses. the rate is how fast it recovers.
function goodsOf({ produces, consumes }) {
    return [
        ...Object.entries(produces ?? {}),
        ...Object.entries(consumes ?? {}),
    ]
}

/*  move stock one step toward its natural level, and no further.
    LEAST/GREATEST clamps the step to the rate, in both directions.
    the query returns no row when stock already sits at the level, so a
    quiet market stays quiet and emits nothing.

    the ::int casts are necessary. postgres cannot find the type of an
    untyped parameter, and `-$4` then fails with
    "operator is not unique: - unknown". */
async function driftOne(client, station, gid, rate) {
    const level = stockFor(station, gid)

    const { rows: [ row ] } = await client.query(`
        UPDATE station_inventory
           SET stock   = stock + LEAST($4::int, GREATEST(-$4::int, $3::int - stock)),
               updated = now()
         WHERE stid = $1
           AND gid = $2
           AND stock <> $3::int
     RETURNING stock, target
    `, [ station.stid, gid, level, rate ])

    if (!row) return

    const { price_buy, price_sell } = quote(gid, row.stock, row.target)

    await client.query(`
        UPDATE markets
           SET price_buy = $3, price_sell = $4, updated = now()
         WHERE stid = $1
           AND gid = $2
    `, [ station.stid, gid, price_buy, price_sell ])

    return emit(EVT.market.price.changed, {
        aggregate_id  : station.stid,
        aggregate_type: 'market',
        payload       : { stid: station.stid, gid, price_buy, price_sell },
    })
}
