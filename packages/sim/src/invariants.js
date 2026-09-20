import { Query } from '@theseus/db'

/*
    things that must hold whatever the players did. each rule runs a
    query that returns the rows that break it - an empty result passes.
    no game rule is re-implemented here, so a rule change never makes
    these lie.

    a rule's run() takes the bound tag from db/query.js. the values
    close over it, so there is no args array to keep in step with the
    placeholders, and the tag repeats a value under one placeholder.
*/

/**
 * @typedef { (sql: Function) => Promise<{ rows: object[] }> } Run
 * @typedef {{ name: string, hard: boolean, note: string, run: Run }} Rule
 */

/**
 * @param  { string } since   - iso timestamp, rows created after it
 * @param  { number } starter - STARTER_CREDITS
 * @return { Rule[] }
 */
export function rules(since, starter) {
    return [
        {
            name: 'wallet ledger',
            hard: true,
            note: 'balance equals the starting credits plus every credit, less every debit',
            run : sql => sql`
                SELECT w.pid, w.balance,
                       round(${ starter }::numeric
                           + coalesce(sum(t.amount) FILTER (WHERE t.type = 'credit'), 0)
                           - coalesce(sum(t.amount) FILTER (WHERE t.type = 'debit'), 0), 2) AS expected
                  FROM player.wallets w
                  JOIN player.players p USING (pid)
                  LEFT JOIN player.wallet_transactions t USING (pid)
                 WHERE p.created >= ${ since }
                 GROUP BY w.pid, w.balance
                HAVING round(w.balance, 2) <> round(${ starter }::numeric
                    + coalesce(sum(t.amount) FILTER (WHERE t.type = 'credit'), 0)
                    - coalesce(sum(t.amount) FILTER (WHERE t.type = 'debit'), 0), 2)`,
        },
        {
            name: 'every executed trade moves money',
            hard: true,
            note: 'an executed trade without a wallet transaction creates or destroys credits',
            run : sql => sql`
                SELECT m.tid, m.side, m.price_total
                  FROM market.trades m
                  LEFT JOIN player.wallet_transactions t ON t.rfid = m.tid
                 WHERE m.status = 'executed'
                   AND m.created >= ${ since }
                   AND t.rfid IS NULL`,
        },
        {
            name: 'trade amount matches the wallet',
            hard: true,
            note: 'the debit or credit equals the price the trade recorded',
            run : sql => sql`
                SELECT m.tid, m.price_total, t.amount, t.type
                  FROM market.trades m
                  JOIN player.wallet_transactions t ON t.rfid = m.tid
                 WHERE m.status = 'executed'
                   AND m.created >= ${ since }
                   AND round(m.price_total, 2) <> round(t.amount, 2)`,
        },
        {
            name: 'a rejected trade leaves no wallet row',
            hard: true,
            note: 'claimRfid writes the row before the balance check, so a refused debit still lands in the ledger',
            run : sql => sql`
                SELECT m.tid, m.price_total, t.type
                  FROM market.trades m
                  JOIN player.wallet_transactions t ON t.rfid = m.tid
                 WHERE m.status = 'rejected'
                   AND m.created >= ${ since }`,
        },
        {
            name: 'no negative balance',
            hard: true,
            note: 'a wallet never goes below zero',
            run : sql => sql`
                SELECT pid, balance
                  FROM player.wallets
                 WHERE balance < 0`,
        },
        {
            name: 'no negative cargo',
            hard: true,
            note: 'a hold never carries less than nothing',
            run : sql => sql`
                SELECT 'market' AS src, sid, gid, quantity
                  FROM market.cargo WHERE quantity < 0
                 UNION ALL
                SELECT 'projection', sid, gid, quantity
                  FROM projection.cargo WHERE quantity < 0`,
        },
        {
            name: 'no negative stock',
            hard: true,
            note: 'a station never holds less than nothing',
            run : sql => sql`
                SELECT stid, gid, stock
                  FROM market.station_inventory
                 WHERE stock < 0`,
        },
        {
            name: 'projection wallets match player wallets',
            hard: true,
            note: 'the read model repeats the write model, or it lies to the client',
            run : sql => sql`
                SELECT p.pid, p.balance AS projection, w.balance AS player
                  FROM projection.wallets p
                  JOIN player.wallets w USING (pid)
                 WHERE round(p.balance, 2) <> round(w.balance, 2)`,
        },
        {
            name: 'projection ships match ship-service',
            hard: true,
            note: 'same ship, same station, same status',
            run : sql => sql`
                SELECT s.sid, s.status AS ship, p.status AS projection,
                       s.stid AS ship_stid, p.stid AS projection_stid
                  FROM ship.ships s
                  JOIN projection.ships p USING (sid)
                 WHERE s.status <> p.status
                    OR coalesce(s.stid, '') <> coalesce(p.stid, '')`,
        },
        {
            name: 'market knows every ship',
            hard: false,
            note: 'a known open gap - market.ships mirrors events.ship and never replays. see docs/progress.md',
            run : sql => sql`
                SELECT s.sid
                  FROM ship.ships s
                  LEFT JOIN market.ships m USING (sid)
                 WHERE m.sid IS NULL`,
        },
    ]
}

/**
 * @param  { import('pg').Pool } pool
 * @param  { string } since   - iso timestamp, the start of the run
 * @param  { number } starter - STARTER_CREDITS
 */
export async function check(pool, since, starter) {
    const sql = Query(pool)
    const out = []

    for (const rule of rules(since, starter)) {
        const seat = { name: rule.name, hard: rule.hard, note: rule.note }
        try {
            const { rows } = await rule.run(sql)
            out.push({
                ...seat,
                ok   : rows.length === 0,
                broke: rows.length,
                rows : rows.slice(0, 5),
            })
        }
        catch (e) {
            out.push({
                ...seat,
                ok   : false,
                broke: -1,
                error: e.message,
                rows : [],
            })
        }
    }
    return out
}

export function failed(results) {
    return results.filter(r => r.hard && !r.ok)
}
