/* eslint-disable camelcase */

import { eventTree as EVT } from '@theseus/contracts'
import { O, Query } from '@theseus/util'

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
        [ EVT.cargo.loaded          ]: cargoLoaded,
        [ EVT.cargo.unloaded        ]: cargoUnloaded,
        [ EVT.trade.executed        ]: tradeExecuted,
        [ EVT.market.price.changed  ]: priceChanged,
    })

    function playerCreated({ payload: { pid, handle }}) {
        return sql`
            insert into players (pid, handle)
                 values (${ pid }, ${ handle })
                 on conflict (pid) do nothing
        `
    }

    function walletCreated({ payload: { pid, balance }}) {
        return sql`
            insert into wallets (pid, balance)
                 values (${ pid }, ${ balance })
                 on conflict (pid) do nothing
        `
    }

    function walletBalance({ payload: { pid, balance }}) {
        return sql`
            update wallets
               set balance = ${ balance },
                   updated = now()
             where pid = ${ pid }
        `
    }

    function shipCreated({ payload: p }) {
        return sql`
            insert into ships (
                sid, pid, stid, name,
                capacity, velocity, status
            )
                 values (
                    ${ p.sid  }, ${ p.pid      }, ${ p.stid     },
                    ${ p.name }, ${ p.capacity }, ${ p.velocity }, 'docked')
                 on conflict (sid) do nothing
        `
    }

    function shipDeparted({ payload: p }) {
        return sql`
            update ships
               set status    = 'transit',
                   "from"    = ${ p.from },
                   "to"      = ${ p.to },
                   departs   = ${ p.departed },
                   arrives   = ${ p.arrives },
                   years_abs = ${ p.years_abs },
                   years_rel = ${ p.years_rel },
                   updated   = now()
             where sid = ${ p.sid }
        `
    }

    function shipArrived({ payload: { sid, stid, arrived }}) {
        return sql`
            update ships
               set stid    = ${ stid },
                   status  = 'docked',
                   arrived = ${ arrived },
                   updated = now()
             where sid = ${ sid }
        `
    }

    function cargoLoaded({ payload: { sid, gid, quantity }}) {
        return sql`
            insert into cargo (sid, gid, quantity)
                 values (${ sid }, ${ gid }, ${ quantity })
                 on conflict (sid, gid) do update
                 set quantity = cargo.quantity + excluded.quantity,
                     updated  = now()
        `
    }

    function cargoUnloaded({ payload: { sid, gid, quantity }}) {
        return sql`
            update cargo
               set quantity = cargo.quantity - ${ quantity },
                   updated  = now()
             where sid = ${ sid }
               and gid = ${ gid }
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
            insert into trade_history (
                tid, gid , pid,
                sid, stid, quantity,
                price_total, price_unit, side
            )
                values (
                    ${ tid         }, ${ gid        }, ${ pid      },
                    ${ sid         }, ${ stid       }, ${ quantity },
                    ${ price_total }, ${ price_unit }, ${ side     }
                )
                    on conflict (tid) do nothing
        `
    }

    function priceChanged({ payload: { gid, stid, price_buy, price_sell }}) {
        return sql`
            insert into market_prices (
                stid     , gid,
                price_buy, price_sell
            )
                values (
                ${ stid      }, ${ gid        },
                ${ price_buy }, ${ price_sell })
                on conflict (stid, gid) do update
                set
                    price_buy = $3,
                    price_sell = $4,
                    updated = now()
        `
    }
}
