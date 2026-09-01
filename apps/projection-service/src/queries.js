import { Query, insert } from '@theseus/db'

// row-level mutators for the read models, one per event this service
// projects. each is idempotent - ON CONFLICT DO NOTHING/UPDATE, so a
// replayed event (rebuild, redelivery) restates the same fact.
export function createQueries(pool) {
    const sql = Query(pool)
    return {
        playerCreated({ payload: { pid, handle }}) {
            return sql`
                INSERT INTO players (pid, handle)
                VALUES (${ pid }, ${ handle })
                ON CONFLICT (pid)
                    DO NOTHING`
        },

        walletCreated({ payload: { pid, balance }}) {
            return sql`
                INSERT INTO wallets (pid, balance)
                VALUES (${ pid }, ${ balance })
                ON CONFLICT (pid)
                    DO NOTHING`
        },

        walletBalance({ payload: { pid, balance }}) {
            return sql`
                UPDATE wallets
                   SET balance = ${ balance },
                       updated = now()
                 WHERE pid = ${ pid }`
        },

        shipCreated({ payload }) {
            return sql`
                INSERT INTO ships (sid, pid, stid, name, capacity, velocity, status)
                VALUES (
                    ${ payload.sid },
                    ${ payload.pid },
                    ${ payload.stid },
                    ${ payload.name },
                    ${ payload.capacity },
                    ${ payload.velocity },
                    'docked')
                ON CONFLICT (sid)
                    DO NOTHING`
        },

        shipDeparted({ payload }) {
            return sql`
                UPDATE ships
                   SET status    = 'transit',
                       "from"    = ${ payload.from },
                       "to"      = ${ payload.to },
                       departs   = ${ payload.departed },
                       arrives   = ${ payload.arrives },
                       years_abs = ${ payload.years_abs },
                       years_rel = ${ payload.years_rel },
                       updated   = now()
                 WHERE sid = ${ payload.sid }`
        },

        shipArrived({ payload: { sid, stid, arrived }}) {
            return sql`
                UPDATE ships
                   SET stid    = ${ stid },
                       status  = 'docked',
                       arrived = ${ arrived },
                       updated = now()
                 WHERE sid = ${ sid }`
        },

        shipRenamed({ payload: { sid, name }}) {
            return sql`
                UPDATE ships
                   SET name    = ${ name },
                       updated = now()
                 WHERE sid = ${ sid }`
        },

        cargoLoaded({ payload: { sid, gid, quantity }}) {
            return sql`
                INSERT INTO cargo (sid, gid, quantity)
                VALUES (${ sid }, ${ gid }, ${ quantity })
                ON CONFLICT (sid, gid)
                    DO UPDATE
                        SET quantity = cargo.quantity + excluded.quantity,
                            updated  = now()`
        },

        cargoUnloaded({ payload: { sid, gid, quantity }}) {
            return sql`
                UPDATE cargo
                   SET quantity = cargo.quantity - ${ quantity },
                       updated  = now()
                 WHERE sid = ${ sid }
                   AND gid = ${ gid }`
        },

        tradeExecuted({ payload }) {
            return sql`
                INSERT INTO trade_history (tid, gid, pid, sid, stid, quantity, price_total, price_unit, side)
                VALUES (
                    ${ payload.tid         },
                    ${ payload.gid         },
                    ${ payload.pid         },
                    ${ payload.sid         },
                    ${ payload.stid        },
                    ${ payload.quantity    },
                    ${ payload.price_total },
                    ${ payload.price_unit  },
                    ${ payload.side })
                ON CONFLICT (tid)
                    DO NOTHING`
        },

        priceChanged({ payload }) {
            return sql`
                INSERT INTO market_prices (stid, gid, price_buy, price_sell)
                VALUES (
                    ${ payload.stid       },
                    ${ payload.gid        },
                    ${ payload.price_buy  },
                    ${ payload.price_sell })
                ON CONFLICT (stid, gid)
                  DO UPDATE
                        SET price_buy  = $3,
                            price_sell = $4,
                            updated    = now()`
        },
    }
}
