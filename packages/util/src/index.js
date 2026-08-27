import { randomUUID } from 'node:crypto'

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

// ── Id ───────────────────────────────────────────────────────

export function guid(prefix) {
    return prefix
        ? `${ prefix }_${ randomUUID() }`
        : randomUUID()
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

// ms since some past instant → a short "1d 2h" / "3h 4m" / "5m 6s" / "7s" string
export function fmtDuration(ms) {
    const s = Math.floor(ms / 1000)
    const d =   s / 86400     | 0,
            h = s / 3600 % 24 | 0,
            m = s / 60 % 60   | 0

    if (d) return `${ d }d ${ h }h`
    if (h) return `${ h }h ${ m }m`
    if (m) return `${ m }m ${ s % 60 }s`
    return `${ s }s`
}

export function formatTime(x) {
    if (Is.not.s(x)) return x

    let [ , n, t ] = x.trim().toLowerCase().match(/^([\d.]+) *(s|m|h|d|w)?/) ?? []
    isNaN(n = +n) && Fail.raise(`invalid time string "${ x }"`)

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

/*  a poll must survive one bad tick.
    without the catch, one rejection stops the loop for the life of the
    process, and nothing reports it. pollOutbox runs on this: a single
    failed publish would stop every event the service sends.
    this cost 2 real bugs before the catch existed. */
export function poll(fx, ms, ...args) {
    ms = formatTime(ms ?? 0)
    let rs, tid, stopped = 0

    async function tick() {
        try {
            rs = await fx(...args)
        }
        catch (e) {
            console.error('poll: tick failed, the loop continues', e)
        }
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
