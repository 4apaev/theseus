import { Query } from '@theseus/db'

/*
    read models over the event log and market.trades. nothing here needs
    a sim run - point it at any database and it answers. the phase 4
    admin board wants the same numbers, so it imports this file instead
    of growing a second copy of the sql.

    one method per question, so a caller pays for the answer it asked
    for. see docs/phase.4.md "admin board ui".
*/

const SCHEMAS = [ 'projection', 'market', 'ship', 'player', 'comms' ]

/**
 * @param  { import('pg').Pool } pool
 */
export function createAnalytics(pool) {
    const sql = Query(pool)

    return {

        // ── the log ──────────────────────────────────────────

        async events(since) {
            const { rows } = await sql`
                SELECT etype, count(*)::int AS count,
                       round(avg(extract(epoch FROM received - occurred) * 1000)::numeric, 1) AS lag_ms
                  FROM projection.event_log
                 WHERE received >= ${ since }
                 GROUP BY etype
                 ORDER BY count DESC`
            return rows
        },

        /*  a rejection says why. the string field is `reason`, the
            module events carry `reasons`, an array - read both  */
        async rejects(since) {
            const { rows } = await sql`
                SELECT etype,
                       coalesce(payload->>'reason', payload->'reasons'->>0, '(none given)') AS reason,
                       count(*)::int AS count
                  FROM projection.event_log
                 WHERE received >= ${ since }
                   AND etype LIKE '%rejected%'
                 GROUP BY 1, 2
                 ORDER BY count DESC`
            return rows
        },

        async tables() {
            const { rows } = await sql`
                SELECT schemaname AS schema, relname AS table, n_live_tup::int AS rows
                  FROM pg_stat_user_tables
                 WHERE schemaname = ANY(${ SCHEMAS })
                 ORDER BY n_live_tup DESC`
            return rows
        },

        // ── the map ──────────────────────────────────────────

        async visits(since) {
            const { rows } = await sql`
                SELECT payload->>'stid' AS stid, count(*)::int AS visits
                  FROM projection.event_log
                 WHERE etype = 'ship.arrived.v1'
                   AND received >= ${ since }
                 GROUP BY 1
                 ORDER BY visits DESC`
            return rows
        },

        /*  one row per leg: an arrival closes a transit, a departure
            closes a stay. a ship still flying counts neither  */
        async clock(since) {
            const { rows } = await sql`
                WITH legs AS (
                    SELECT payload->>'sid' AS sid, etype, occurred,
                           lag(etype)    OVER w AS prev_type,
                           lag(occurred) OVER w AS prev_at
                      FROM projection.event_log
                     WHERE etype IN ('ship.departed.v1', 'ship.arrived.v1')
                       AND received >= ${ since }
                    WINDOW w AS (PARTITION BY payload->>'sid' ORDER BY occurred)
                )
                SELECT p.handle, s.name AS ship,
                       round(coalesce(sum(extract(epoch FROM occurred - prev_at))
                           FILTER (WHERE etype = 'ship.arrived.v1' AND prev_type = 'ship.departed.v1'), 0)::numeric, 1) AS transit_s,
                       round(coalesce(sum(extract(epoch FROM occurred - prev_at))
                           FILTER (WHERE etype = 'ship.departed.v1' AND prev_type = 'ship.arrived.v1'), 0)::numeric, 1) AS docked_s
                  FROM legs
                  JOIN projection.ships s USING (sid)
                  JOIN projection.players p ON p.pid = s.pid
                 GROUP BY 1, 2
                HAVING coalesce(sum(extract(epoch FROM occurred - prev_at)), 0) > 0
                 ORDER BY transit_s DESC`
            return rows
        },

        // the point of the whole game: a fast ship ages less than the galaxy
        async relativity(since) {
            const { rows } = await sql`
                SELECT p.handle,
                       round(sum((e.payload->>'years_abs')::numeric), 2) AS galaxy_years,
                       round(sum((e.payload->>'years_rel')::numeric), 2) AS ship_years,
                       round(sum((e.payload->>'years_abs')::numeric)
                           - sum((e.payload->>'years_rel')::numeric), 2) AS saved
                  FROM projection.event_log e
                  JOIN projection.players p ON p.pid = e.payload->>'pid'
                 WHERE e.etype = 'ship.departed.v1'
                   AND e.received >= ${ since }
                 GROUP BY 1
                 ORDER BY saved DESC`
            return rows
        },

        // ── the money ────────────────────────────────────────

        async traders(since) {
            const { rows } = await sql`
                SELECT p.handle, count(*)::int AS trades,
                       count(*) FILTER (WHERE t.side = 'buy')::int  AS buys,
                       count(*) FILTER (WHERE t.side = 'sell')::int AS sells,
                       sum(t.quantity)::int AS units
                  FROM market.trades t
                  JOIN projection.players p ON p.pid = t.pid
                 WHERE t.status = 'executed'
                   AND t.created >= ${ since }
                 GROUP BY 1
                 ORDER BY trades DESC`
            return rows
        },

        async wallets(since, starter) {
            const { rows } = await sql`
                SELECT p.handle, round(w.balance, 2) AS balance,
                       round(w.balance - ${ starter }::numeric, 2) AS profit
                  FROM player.wallets w
                  JOIN projection.players p USING (pid)
                 WHERE p.created >= ${ since }
                 ORDER BY w.balance DESC`
            return rows
        },

        /*  a sell pays the player, a buy costs him. the same 2 sums
            flip for the station, so one shape answers both sides  */
        async goods(since) {
            const { rows } = await sql`
                SELECT gid, sum(quantity)::int AS units, count(*)::int AS trades,
                       round(coalesce(sum(price_total) FILTER (WHERE side = 'sell'), 0)
                           - coalesce(sum(price_total) FILTER (WHERE side = 'buy'), 0), 2) AS player_profit
                  FROM market.trades
                 WHERE status = 'executed'
                   AND created >= ${ since }
                 GROUP BY 1
                 ORDER BY units DESC`
            return rows
        },

        async stations(since) {
            const { rows } = await sql`
                SELECT stid, count(*)::int AS trades,
                       round(coalesce(sum(price_total) FILTER (WHERE side = 'buy'), 0)
                           - coalesce(sum(price_total) FILTER (WHERE side = 'sell'), 0), 2) AS station_profit
                  FROM market.trades
                 WHERE status = 'executed'
                   AND created >= ${ since }
                 GROUP BY 1
                 ORDER BY station_profit DESC`
            return rows
        },
    }
}

/** the 3 log views the report opens with */
export async function dbStats(pool, since) {
    const a = createAnalytics(pool)
    const [ events, rejects, tables ] = await Promise.all([
        a.events(since),
        a.rejects(since),
        a.tables(),
    ])
    return { events, rejects, tables }
}

/** what the players did to each other and to the map */
export async function gameStats(pool, since, starter) {
    const a = createAnalytics(pool)
    const [ visits, clock, traders, wallets, goods, stations, relativity ] = await Promise.all([
        a.visits(since),
        a.clock(since),
        a.traders(since),
        a.wallets(since, starter),
        a.goods(since),
        a.stations(since),
        a.relativity(since),
    ])
    return { visits, clock, traders, wallets, goods, stations, relativity }
}
