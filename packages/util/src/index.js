import * as Constants from 'garage/constants'
import {
    A,     O,
    Is,    Fail,
    each,  concat,
    echo,  random,
} from 'garage/util'

// ── Garage ───────────────────────────────────────────────────

export {
    A,     O,
    Is,    Fail,
    each,  concat,
    echo,  random,
    Constants,
}

// ── Codec ────────────────────────────────────────────────────

export function encodeJson(value) {
    return Buffer.from(
        JSON.stringify(value),
        'utf8',
    )
}

export function decodeJson(value) {
    return JSON.parse(
        Is.B(value)
            ? value.toString('utf8')
            : value,
    )
}

export const Codec = {
    encode: encodeJson,
    decode: decodeJson,
}

// ── String ────────────────────────────────────────────────────

export function Raw(s, ...a) {
    return (a => s?.raw
        ? String.raw(s, ...a)
        : String(s).concat(...a)
    )(concat(...a).map(String))
}

export function up(s) { return s.toUpperCase() }
export function low(s) { return s.toLowerCase() }
export function trim(s) { return s.trim() }
export function camel2snake(s, ...a) { return s.match(/[A-Z]?[a-z]+/g).map(low).concat(...a).join('_') }

export function formatTime(x) {
    if (Is.not.s(x)) return x

    let [ , n, t ] = x.trim().toLowerCase().match(/^([\d.]+) *(s|m|h|d|w)?/) ?? []
    isNaN(n = +n) && Fail.raise(`invalid time string "${ x }"`, x)

    switch (t) {
        case 's': return n * 1000
        case 'm': return n * 1000 * 60
        case 'h': return n * 1000 * 60 * 60
        case 'd': return n * 1000 * 60 * 60 * 24
        case 'w': return n * 1000 * 60 * 60 * 24 * 7
        default : return n
    }
}

// ─────────────────────────────────────────────────────────────

export function poll(fx, ms) {
    ms = formatTime(ms ?? 0)
    let rs, tid, stopped = 0

    async function tick() {
        rs = await fx()
        stopped || (tid = setTimeout(tick, ms))
    }
    tick()
    return {
        get result() { return rs },
        stop() {
            stopped = 1
            clearTimeout(tid)
        } }
}

// ── DB ───────────────────────────────────────────────────────

export async function withClient(pool, fx) {
    const client = await pool.connect()
    try { /*
        in an async function, finally fires synchronously
        after return, before the returned promise resolves.
        client.release() fires while fx is still running.
        tus, needs await.
     */ return await fx(client, Query(client))
    }
    finally {
        client.release()
    }
}

export function Query(pool) {
    return ({ raw }, ...subs) => {
        const sql = []
        const vals = []
        const seen = new Map

        for (let x, i = 0; i < raw.length; i++) {
            sql.push(raw[ i ])

            if (i >= subs.length)
                continue

            seen.has(x = subs[ i ])
            || seen.set(x, vals.push(x))

            sql.push(`$${ seen.get(x) }`)
        }
        return pool.query(sql.join(''), vals)
    }
}

export function where(table, query) {
    Is.o(table)
        ? (query = table, table = '')
        : table += '.'

    let sql = '', vls  = []
    each(query, (k, v, i) => {
        vls.push(v)
        sql += `
    ${ i
        ? 'and'
        : 'where' } ${ table }${ k } = $${ i + 1 }`
    })
    return [ sql, vls ]
}

export function selectWhere(table, query, ...keys) {
    keys.length || keys.push('*')
    const [ sql, vls ] = where(table, query)
    return [
        `select ${ keys.join(', ') } from ${ table } ${ sql }`,
        vls,
    ]
}
