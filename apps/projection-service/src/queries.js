import { Query } from '@theseus/db'

/**
 * row-level mutators for the read models, one per event this service
 * projects. most are one idempotent statement - ON CONFLICT DO
 * NOTHING/UPDATE, so a replayed event (rebuild, redelivery) restates
 * the same fact. shipRigChanged and cargoModuleExchanged are not -
 * each needs 2 statements to land together, so they take `transact`.
 *
 * `transact`'s default lets scripts/rebuild.js keep calling
 * createHandlers(client) with no 2nd argument: rebuild already
 * replays every event inside its own outer transaction, so the
 * default just calls the callback with that same client, no
 * nested BEGIN/COMMIT of its own.
 */
export function createQueries(pool, transact = (p, fn) => fn(p)) {
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

        async shipCreated({ payload: p }) {
            await sql`
                INSERT INTO ships (sid, pid, stid, name, capacity, velocity, hull, rig, power, power_pool, status)
                VALUES (
                    ${ p.sid        },
                    ${ p.pid        },
                    ${ p.stid       },
                    ${ p.name       },
                    ${ p.capacity   },
                    ${ p.velocity   },
                    ${ p.hull       },
                    ${ p.rig        },
                    ${ p.power      },
                    ${ p.power_pool },
                    'docked'
                )
                ON CONFLICT (sid)
                    DO NOTHING`

            for (const { slot, gid } of p.fitted) {
                await sql`
                    INSERT INTO fitted_modules (sid, slot, gid)
                    VALUES (${ p.sid }, ${ slot }, ${ gid })
                    ON CONFLICT (sid, slot)
                        DO NOTHING`
            }
        },

        // only when newer - a late or duplicate ship.rig.changed must
        // not overwrite a rig this ship has already moved past
        async shipRigChanged({ payload: p }) {
            await transact(pool, async client => {
                const tsql = Query(client)
                const { rowCount } = await tsql`
                    UPDATE ships
                       SET hull       = ${ p.hull },
                           rig        = ${ p.rig },
                           capacity   = ${ p.capacity },
                           velocity   = ${ p.velocity },
                           power      = ${ p.power },
                           power_pool = ${ p.power_pool },
                           updated    = now()
                     WHERE sid = ${ p.sid }
                       AND rig < ${ p.rig }`

                if (!rowCount) return // stale or duplicate

                await tsql`DELETE FROM fitted_modules WHERE sid = ${ p.sid }`
                for (const { slot, gid } of p.fitted)
                    await tsql`INSERT INTO fitted_modules (sid, slot, gid) VALUES (${ p.sid }, ${ slot }, ${ gid })`
            })
        },

        // incoming leaves cargo, outgoing joins it - either may be absent
        async cargoModuleExchanged({ payload: p }) {
            await transact(pool, async client => {
                const tsql = Query(client)
                p.incoming && await tsql`
                    UPDATE cargo
                       SET quantity = quantity - 1, updated = now()
                     WHERE sid = ${ p.sid }
                       AND gid = ${ p.incoming }`

                p.outgoing && await tsql`
                    INSERT INTO cargo (sid, gid, quantity)
                    VALUES (${ p.sid }, ${ p.outgoing }, 1)
                    ON CONFLICT (sid, gid)
                        DO UPDATE
                            SET quantity = cargo.quantity + 1,
                                updated  = now()`
            })
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
