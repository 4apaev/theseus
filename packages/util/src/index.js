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

// ── Time ────────────────────────────────────────────────────

/**
 * milliseconds to time string: [ 42d 23h 32m 16s | 20h 30m 7s | 32m 16s ]
 *
 * @param  {number} ms
 * @return {string}
 */
export function fmtDuration(ms) {
    const rs = [],
            s = 0 | ms / 1000,
            d = 0 | s  / 86400,
            h = 0 | s  / 3600 % 24,
            m = 0 | s  / 60 % 60

    d && rs.push(d + 'd')
    h && rs.push(h + 'h')
    m && rs.push(m + 'm')
    s && rs.push(s % 60 + 's')
    return rs.join(' ')
}

/**
 * time string: [ 16d | 23h | 4m | 6s ] to milliseconds
 *
 * @param  {string|number} x
 * @return {number}
 */
export function formatTime(x) {
    if (typeof x != 'string') return x

    let [ , n, t ] = low(x).match(/^ *([\d.]+) *(s|m|h|d|w)?/) ?? []
    isNaN(n = +n) && Fail.raise(`invalid time string "${ x }"`, x, formatTime)

    switch (t) {
        case 's': return n * 1000
        case 'm': return n * 1000 * 60
        case 'h': return n * 1000 * 60 * 60
        case 'd': return n * 1000 * 60 * 60 * 24
        case 'w': return n * 1000 * 60 * 60 * 24 * 7
        default : return n
    }
}

/**
 * @template {(...a: any[]) => any} F
 *
 * @param {F} fx
 * @param {string | number} [x]
 * @param {Parameters<F>} [args]
 * @return {Promise<{ result: ReturnType<F>, stop: () => void }>}
 */
export function poll(fx, x, ...args) {
    const ms = formatTime(x ?? 0)
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
    return { // @ts-ignore
        get result() { return rs },
        stop() {
            stopped = 1
            clearTimeout(tid)
        } }
}

/**
 * creates `then` function that returns time diff
 * between two calls.
 *
 * the method `valueOf` of `now` and `then` returns a number,
 * which enables number like behavior for both.
 *
 * `now.valueOf` returns Date.now
 * `then.valueOf` returns the time when it was invoked
 *
 * now(ms) -> produces `then`
 * then()  -> actual diff
 * now > then -> true
 *
 * @param  {string|number} ms
 * @return {() => number}
 */
export function now(ms) {              // @ts-ignore
    const start = formatTime(ms) + now // @ts-ignore
    const then = () => now - start
    then.valueOf = () => start
    return then
}
now.valueOf = Date.now

/**
 * @template {Fx} F
 * @param {F} fx
 * @param {string|number} [ms]
 * @param {string|number} [delay]
 * @param {Parameters<F>} [args]
 * @return {Promise<ReturnType<F>>}
 */
export async function waitFor(fx, ms, delay, ...args) {
    delay = formatTime(delay ?? 50)
    const deadline =  now(ms ?? 5000)

    // @ts-ignore
    while (now < deadline) {
        const rs = await fx(...args)
        if (rs) return rs
        await sleep(delay)
    }
    throw new Fail('waitFor timed out', { cause: deadline }, waitFor)
}

/**
 * @template T
 * @param {string|number} ms
 * @param {T} [x]
 * @return {Promise<T>}
 */
export function sleep(ms, x) {
    return new Promise(ok => setTimeout(ok, formatTime(ms), x))
}

// ─────────────────────────────────────────────────────────────

/**
 * @template T
 * @param {ArrayLike<T>} it
 * @param {AQuery<T>} query
 * @param {unknown} [ctx]
 * @return {T[]|undefined}
 */
export function where(it, query, ctx) {
    const rs = A.where(it, query, ctx)
    return rs.length ? rs : void 0
}

/**
 * @template T
 * @param {ArrayLike<T>} it
 * @param {AQuery<T>} query
 * @param {unknown} [ctx]
 * @return {T}
 */
export function findWhere(it, query, ctx) {
    return it.find(A.pre(query), ctx)
}

/**
 * @template T
 * @param {unknown} [x]
 * @return {T}
 */
export function nil(x) {
    if (Is.a(x)) return x.map(nil), x
    return Is.x(x)
        ? each(x, nil, O.setPrototypeOf(x, null))
        : x
}

/**
 * @typedef {(...a: any[]) => any} Fx
 * @typedef {typeof A.pre} AQuery
 */
