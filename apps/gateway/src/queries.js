import { Query } from '@theseus/db'

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
                       capacity, velocity, hull, rig, power, power_pool,
                       years_abs, years_rel, updated
                  FROM ships
                 WHERE pid = ${ pid }
                 ORDER BY name`
            return rows
        },

        // fitted slots, owner-scoped through the same join cargo() uses
        async modules(sid, pid) {
            const { rows } = await sql`
                SELECT fm.slot, fm.gid
                  FROM fitted_modules fm
                  JOIN ships s USING (sid)
                 WHERE fm.sid = ${ sid }
                   AND s.pid = ${ pid }
                 ORDER BY fm.slot`
            return rows
        },

        async cargo(sid, pid) {
            const { rows } = await sql`
                SELECT c.gid, c.quantity, c.updated
                  FROM cargo c
                  JOIN ships s USING (sid)
                 WHERE c.sid = ${ sid }
                   AND s.pid = ${ pid }
                   AND c.quantity > 0
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

        /*
            sent by the caller, received by the caller,
            or station chat at the caller's current dock.
            a subquery on ships finds that dock.
            a player with no docked ship sees no station chat.
            such a player still sees direct messages.
        */
        async messages(pid) {
            const { rows } = await sql`
                SELECT *
                  FROM messages
                 WHERE "from" = ${ pid }
                    OR "to" = ${ pid }
                    OR stid = (SELECT stid FROM ships WHERE pid = ${ pid } AND status = 'docked')
                 ORDER BY sent DESC
                 LIMIT 100`
            return rows
        },

        /*  public ship traffic. one query, two routes.
            no stid gives the whole fleet. a stid gives one station.
            the result has no pid. a player sees another player by handle.

            CASE: the projection does not clear stid on departure
            (projection-service/handlers.js shipDeparted), and the column
            is `not null`, so it cannot be cleared. a ship in transit
            keeps the station it left. the CASE hides that old value.

            AND status = 'docked': without this test a port list shows
            ships that departed hours ago.

            ::text: postgres cannot find the type of $1 from `$1 IS NULL`
            alone. the cast tells it.  */
        async traffic(stid = null) {
            const { rows } = await sql`
                SELECT s.sid, p.handle, s.name, s.status,
                       CASE WHEN s.status = 'docked' THEN s.stid END AS stid,
                       s."from", s."to", s.arrives, s.arrived, s.years_abs
                  FROM ships s
                  JOIN players p USING (pid)
                 WHERE ${ stid }::text IS NULL
                    OR (s.status = 'docked' AND s.stid = ${ stid })
                 ORDER BY p.handle, s.name`
            return rows
        },

        // ── admin ────────────────────────────────────────────

        async allPlayers() {
            const { rows } = await sql`
                SELECT p.pid, p.handle, p.created, w.balance
                  FROM players p
                  JOIN wallets w USING (pid)
                 ORDER BY p.created`
            return rows
        },

        async eventLog() {
            const { rows } = await sql`
                SELECT eid, event_type, payload, occurred, received
                  FROM event_log
                 ORDER BY received DESC
                 LIMIT 200`
            return rows
        },

        // the market schema is the source for stock.
        // the projection's market_prices table has only the quote.
        async inventory(stid) {
            const { rows } = await sql`
                SELECT gid, stock, target, updated
                  FROM market.station_inventory
                 WHERE stid = ${ stid }
                 ORDER BY gid`
            return rows
        },
    }
}
