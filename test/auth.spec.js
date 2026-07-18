import test   from 'node:test'
import assert from 'node:assert/strict'

import '#packages/testing/src/index.js?title=🧪 🔐 AUTH'
import * as Auth from '@theseus/auth'

const SECRET = 'test-secret'

// ── round trip ───────────────────────────────────────────────────────────────

test('sign() / verify() round-trips the payload', () => {
    const payload = { pid: 'p1', handle: 'alice' }

    const token  = Auth.sign(payload, SECRET)
    const claims = Auth.verify(token, SECRET)

    assert.equal(claims.pid, payload.pid)
    assert.equal(claims.handle, payload.handle)
})

test('sign() stamps iat and exp from ttl', () => {
    const token  = Auth.sign({ pid: 'p1' }, SECRET, '1h')
    const claims = Auth.verify(token, SECRET)

    assert.equal(claims.exp - claims.iat, 3600)
})

test('sign() defaults ttl to 7d', () => {
    const token  = Auth.sign({ pid: 'p1' }, SECRET)
    const claims = Auth.verify(token, SECRET)

    assert.equal(claims.exp - claims.iat, 7 * 24 * 3600)
})

// ── rejections ───────────────────────────────────────────────────────────────

test('sign() rejects non object payload', () => {
    assert.throws(
        () => Auth.sign(42, SECRET),
        e => e.code === 401 && e.message === 'invalid payload',
    )
})

test('verify() rejects not string token', () => {
    assert.throws(
        () => Auth.verify(42, SECRET),
        e => e.code === 401 && e.message === 'invalid token',
    )
})

test('verify() rejects the wrong secret', () => {
    const token = Auth.sign({ pid: 'p1' }, SECRET)
    assert.throws(
        () => Auth.verify(token, 'wrong'),
        e => e.code === 401 && e.message === 'bad signature',
    )
})

test('verify() rejects a tampered payload', () => {
    const token = Auth.sign({ pid: 'p1' }, SECRET)
    const [ head, body, sig ] = token.split('.')
    const flip  = c => c === 'a' ? 'b' : 'a'
    const bent  = body.slice(0, -1) + flip(body.slice(-1))

    assert.throws(
        () => Auth.verify(`${ head }.${ bent }.${ sig }`, SECRET),
        e => e.code === 401 && e.message === 'bad signature',
    )
})

test('verify() rejects an expired token', () => {
    const token = Auth.sign({ pid: 'p1' }, SECRET, -5000) // exp 5s in the past
    assert.throws(
        () => Auth.verify(token, SECRET),
        e => e.code === 401 && e.message === 'token expired',
    )
})

test('verify() rejects malformed tokens', () => {
    for (const bad of [ 'garbage', 'a.b', 'a.b.c.d', '', 'a..c' ]) {
        assert.throws(
            () => Auth.verify(bad, SECRET),
            e => e.code === 401,
            `expected "${ bad }" to be rejected`,
        )
    }
})

test('verify() handles a signature of mismatched length without crashing', () => {
    const token = Auth.sign({ pid: 'p1' }, SECRET)
    const [ head, body ] = token.split('.')

    assert.throws(
        () => Auth.verify(`${ head }.${ body }.short`, SECRET),
        e => e.code === 401 && e.message === 'bad signature',
    )
})

// ── factory ──────────────────────────────────────────────────────────────────

test('create() binds the secret once', () => {
    const auth  = Auth.create(SECRET)
    const token = auth.sign({ pid: 'p1' })

    assert.equal(auth.verify(token).pid, 'p1')
})

test('two factories with different secrets reject each other', () => {
    const a1 = Auth.create('s1')
    const a2 = Auth.create('s2')
    const token = a1.sign({ pid: 'p1' })

    assert.throws(
        () => a2.verify(token),
        e => e.code === 401 && e.message === 'bad signature',
    )
})
