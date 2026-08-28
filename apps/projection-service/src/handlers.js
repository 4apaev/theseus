/* eslint-disable camelcase */

import { eventTree as EVT } from '@theseus/contracts'
import { O }     from '@theseus/util'
import { Query } from '@theseus/db'

export function createHandlers(pool) {
    const sql = Query(pool)

    return O.ƒ({
        [ EVT.player.created        ]: playerCreated,
        [ EVT.wallet.created        ]: walletCreated,
        [ EVT.wallet.debited        ]: walletBalance,
        [ EVT.wallet.credited       ]: walletBalance,
        [ EVT.ship.created          ]: shipCreated,
        [ EVT.ship.departed         ]: shipDeparted,
        [ EVT.ship.arrived          ]: shipArrived,
        [ EVT.ship.renamed          ]: shipRenamed,
        [ EVT.cargo.loaded          ]: cargoLoaded,
        [ EVT.cargo.unloaded        ]: cargoUnloaded,
        [ EVT.trade.executed        ]: tradeExecuted,
        [ EVT.market.price.changed  ]: priceChanged,
    })

    function playerCreated({ payload: { pid, handle }}) {
        return sql`
            INSERT INTO players (pid, handle)
                 VALUES (${ pid }, ${ handle })
            ON CONFLICT (pid)
             DO NOTHING
        `
    }

    function walletCreated({ payload: { pid, balance }}) {
        return sql`
            INSERT INTO wallets (pid, balance)
                 VALUES (${ pid }, ${ balance })
            ON CONFLICT (pid)
             DO NOTHING
        `
    }

    function walletBalance({ payload: { pid, balance }}) {
        return sql`
            UPDATE wallets
               SET balance = ${ balance },
                   updated = now()
             WHERE pid = ${ pid }
        `
    }

    function shipCreated({ payload: p }) {
        return sql`
            INSERT INTO ships (sid, pid, stid, name, capacity, velocity, status)
                 VALUES (${ p.sid }, ${ p.pid }, ${ p.stid }, ${ p.name }, ${ p.capacity }, ${ p.velocity }, 'docked')
            ON CONFLICT (sid)
             DO NOTHING
        `
    }

    function shipDeparted({ payload: p }) {
        return sql`
            UPDATE ships
               SET status    = 'transit',
                   "from"    = ${ p.from },
                   "to"      = ${ p.to },
                   departs   = ${ p.departed },
                   arrives   = ${ p.arrives },
                   years_abs = ${ p.years_abs },
                   years_rel = ${ p.years_rel },
                   updated   = now()
             WHERE sid = ${ p.sid }
        `
    }

    function shipArrived({ payload: { sid, stid, arrived }}) {
        return sql`
            UPDATE ships
               SET stid    = ${ stid },
                   status  = 'docked',
                   arrived = ${ arrived },
                   updated = now()
             WHERE sid = ${ sid }
        `
    }

    function shipRenamed({ payload: { sid, name }}) {
        return sql`
            UPDATE ships
               SET name    = ${ name },
                   updated = now()
             WHERE sid = ${ sid }
        `
    }

    function cargoLoaded({ payload: { sid, gid, quantity }}) {
        return sql`
            INSERT INTO cargo (sid, gid, quantity)
                 VALUES (${ sid }, ${ gid }, ${ quantity })
            ON CONFLICT (sid, gid)
              DO UPDATE
                    SET quantity = cargo.quantity + excluded.quantity,
                        updated  = now()
        `
    }

    function cargoUnloaded({ payload: { sid, gid, quantity }}) {
        return sql`
            UPDATE cargo
               SET quantity = cargo.quantity - ${ quantity },
                   updated  = now()
             WHERE sid = ${ sid }
               AND gid = ${ gid }
        `
    }

    function tradeExecuted({ payload: {
        tid,
        gid,
        pid,
        sid,
        stid,
        quantity,
        price_total,
        price_unit,
        side,
    }}) {
        return sql`
            INSERT INTO trade_history (tid, gid, pid, sid, stid, quantity, price_total, price_unit, side)
                 VALUES (${ tid }, ${ gid }, ${ pid }, ${ sid }, ${ stid }, ${ quantity }, ${ price_total }, ${ price_unit }, ${ side })
            ON CONFLICT (tid)
             DO NOTHING
        `
    }

    function priceChanged({ payload: { gid, stid, price_buy, price_sell }}) {
        return sql`
            INSERT INTO market_prices (stid, gid, price_buy, price_sell)
                 VALUES (${ stid }, ${ gid }, ${ price_buy }, ${ price_sell })
            ON CONFLICT (stid, gid)
              DO UPDATE
                    SET price_buy  = $3,
                        price_sell = $4,
                        updated    = now()
        `
    }
}
