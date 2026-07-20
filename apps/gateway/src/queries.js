import { Query } from '@theseus/util'

// read-only lookups against the projection schema.
// cargo joins ships so a player can only see their own holds.
export function createQueries(pool) {
    const sql = Query(pool)

    return {
        async me(pid) {
            const { rows } = await sql`
                SELECT p.pid, p.handle, p.created, w.balance
                  FROM players p
                  JOIN wallets w USING (pid)
                 WHERE p.pid = ${ pid }`
            return rows[ 0 ]
        },

        async ships(pid) {
            const { rows } = await sql`
                SELECT sid, name, status, stid, "from", "to",
                       departs, arrives, arrived,
                       capacity, velocity, years_abs, years_rel, updated
                  FROM ships
                 WHERE pid = ${ pid }
                 ORDER BY name`
            return rows
        },

        async cargo(sid, pid) {
            const { rows } = await sql`
                SELECT c.gid, c.quantity, c.updated
                  FROM cargo c
                  JOIN ships s USING (sid)
                 WHERE c.sid = ${ sid }
                   AND s.pid = ${ pid }
                 ORDER BY c.gid`
            return rows
        },

        async market(stid) {
            const { rows } = await sql`
                SELECT gid, price_buy, price_sell, updated
                  FROM market_prices
                 WHERE stid = ${ stid }
                 ORDER BY gid`
            return rows
        },

        async trades(pid) {
            const { rows } = await sql`
                SELECT tid, gid, sid, stid, quantity,
                       price_total, price_unit, side, created
                  FROM trade_history
                 WHERE pid = ${ pid }
                 ORDER BY created DESC
                 LIMIT 100`
            return rows
        },
    }
}
