import * as Crypt from 'node:crypto'

import {
    Is,
    Fail,
    formatTime,
} from '@theseus/util'

// ─────────────────────────────────────────────────────────────────────────────
const TTL = '7d'
const ENC = 'base64url'
const HEAD = encode({
    alg: 'HS256',
    typ: 'JWT',
})

// ─────────────────────────────────────────────────────────────────────────────

function mac(secret, ...data) {
    return Crypt.createHmac('sha256', secret)
        .update(data.join('.'))
        .digest(ENC)
}

function encode(x) {
    return Buffer.from(JSON.stringify(x))
        .toString(ENC)
}

function decode(x) {
    try {
        return JSON.parse(Buffer.from(x, ENC))
    }
    catch {
        return void 0
    }
}

function equal(a, b) {
    return a.length === b.length && Crypt.timingSafeEqual(
        Buffer.from(a),
        Buffer.from(b),
    )
}

function time(x) {
    const ms = x
        ? formatTime(x)
        : Date.now()
    return Math.floor(ms / 1000)
}

// ─────────────────────────────────────────────────────────────────────────────

export function sign(payload, secret, ttl = TTL) {
    Is.o(payload) || Fail.raise(401, 'invalid payload')

    payload.iat = time()
    payload.exp = time(ttl) + payload.iat

    const body = encode(payload)
    return [
        HEAD,
        body,
        mac(secret, HEAD, body),
    ].join('.')
}

export function verify(token, secret) {
    Is.s(token)                          || Fail.raise(401, 'invalid token')
    const [ head, body, sig ] = token.split('.')

    head && body && sig                  || Fail.raise(401, 'invalid token')
    equal(sig, mac(secret, head, body))  || Fail.raise(401, 'bad signature')
    const payload = decode(body)         || Fail.raise(401, 'malformed token')
    payload.exp > time()                 || Fail.raise(401, 'token expired')
    return payload
}

export function create(secret, ttl = TTL) {
    return {
        sign(x) {
            return sign(x, secret, ttl)
        },
        verify(x) {
            return verify(x, secret)
        },
    }
}
