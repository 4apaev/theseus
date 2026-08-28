import { Query, insert, selectWhere } from '@theseus/db'

// overrides is an ordered queue, not a lookup - call N gets overrides[N],
// given that call's params. this is by call order, not by matching the
// query's own sql text - wording, casing, or reformatting a query never
// breaks a test.
//
// one entry means "every call gets this" - a poll's loop of same-shape
// calls only needs one function. several entries means a fixed sequence:
// once it's used up, later calls fall back to the { rows: [] } default,
// same as an unmatched call always got. it must NOT repeat the last
// entry - a poll can issue a different number of queries per tick (for
// example: fetch, then mark only if a row came back), and repeating the
// last entry would feed a later tick's first query the previous tick's
// last response.
export function fakeClient(overrides = []) {
    const log = []
    let i = 0, client

    return client = {
        log,
        release() {},
        sql: Query(client),
        insert(t, d) { return insert(client, t, d) },
        async query(sql, params) {
            log.push({ sql: sql.trim(), params })
            const fx = overrides.length === 1 ? overrides[ 0 ] : overrides[ i++ ]
            return fx ? fx(params) : { rows: []}
        },
    }
}

export function fakePool(overrides = []) {
    const client = fakeClient(overrides)
    return {
        client,
        query  : client.query,
        connect: () => Promise.resolve(client),
    }
}

const TABLE = /\b(?:from|join)\s+([\w.]+)/gi

// the sorted, +-joined set of tables a query touches, parsed from the sql
// itself - never hand-typed by the test author, so casing, wording, or
// clause order never breaks a match.
function tablesOf(sql) {
    return [ ...sql.matchAll(TABLE) ]
        .map(([ , t ]) => t.toLowerCase())
        .sort()
        .join('+')
}

// for a client/pool that answers many unrelated callers over its whole
// lifetime (one query shape always gets the same standing answer) - not
// fakeClient's single deterministic call sequence. overrides is keyed by
// tablesOf(sql), e.g. 'ships' or 'cargo+ships'.
export function fakeTableClient(overrides = {}) {
    let log = [], client
    return client = {
        log,
        release() {},
        sql: Query(client),
        insert(t, d) { return insert(client, t, d) },
        async query(sql, params) {
            log.push({ sql: sql.trim(), params })
            const fx = overrides[ tablesOf(sql) ]
            return fx ? fx(params) : { rows: []}
        },
    }
}

export function fakeTablePool(overrides = {}) {
    const client = fakeTableClient(overrides)
    return {
        client,
        query  : client.query,
        connect: () => Promise.resolve(client),
    }
}

export function fakeTransact(client) {
    return (pool, fn) => fn(client)
}

export function outboxEvents(client) {
    return client.log
        .filter(({ sql }) => /insert +into +outbox/i.test(sql))
        .map(({ params }) => JSON.parse(params[ 3 ]))
}

export function makeCmd(payload, extra = {}) {
    return {
        cmd           : 'cmd-test',
        correlation_id: 'corr-test',
        payload,
        ...extra,
    }
}
