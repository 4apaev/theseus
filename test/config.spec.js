import assert from 'node:assert/strict'
import test   from 'node:test'

import { format, readEnv, requireEnv } from '#packages/config/src/env.js'
import { bootService, isMain         } from '#packages/config/src/service.js'

import '#packages/testing/src/index.js?title=🧪 🎛️  CONFIG'

// ── format ──────────────────────────────────────────────────────────────────

test('format returns undefined for null, undefined, empty string', () => {
    assert.equal(format(null),      undefined)
    assert.equal(format(undefined), undefined)
    assert.equal(format(''),        undefined)
})

test('format coerces boolean strings', () => {
    assert.equal(format('true'),  true)
    assert.equal(format('TRUE'),  true)
    assert.equal(format('false'), false)
    assert.equal(format('FALSE'), false)
})

test('format coerces numeric strings', () => {
    assert.equal(format('0'),    0)
    assert.equal(format('42'),   42)
    assert.equal(format('3.14'), 3.14)
})

test('format preserves non-numeric strings', () => {
    assert.equal(format('hello'),   'hello')
    assert.equal(format('pg://db'), 'pg://db')
})

// ── readEnv ─────────────────────────────────────────────────────────────────

test('readEnv returns fallback for missing key', () => {
    assert.equal(readEnv('THESEUS_DOES_NOT_EXIST_XYZ', 'fallback'), 'fallback')
})

test('readEnv returns undefined fallback when not provided', () => {
    assert.equal(readEnv('THESEUS_DOES_NOT_EXIST_XYZ'), undefined)
})

test('readEnv does not discard 0', () => {
    process.env[ '_TEST_ZERO' ] = '0'
    assert.equal(readEnv('_TEST_ZERO', 99), 0)
    delete process.env[ '_TEST_ZERO' ]
})

test('readEnv does not discard false', () => {
    process.env[ '_TEST_FALSE' ] = 'false'
    assert.equal(readEnv('_TEST_FALSE', true), false)
    delete process.env[ '_TEST_FALSE' ]
})

// ── requireEnv ──────────────────────────────────────────────────────────────

test('requireEnv throws for missing key', () => {
    assert.throws(
        () => requireEnv('THESEUS_DOES_NOT_EXIST_XYZ'),
        /missing required env var/,
    )
})

test('requireEnv returns the value for a present key', () => {
    process.env[ '_TEST_PRESENT' ] = 'hello'
    assert.equal(requireEnv('_TEST_PRESENT'), 'hello')
    delete process.env[ '_TEST_PRESENT' ]
})

// ── service ──────────────────────────────────────────────────────────────────

test('bootService logs a structured boot line', t => {
    const log = t.mock.method(console, 'log', () => {})

    bootService({ service: 'spec-service', role: 'testing', owns: [ 'nothing' ]})

    const line = JSON.parse(log.mock.calls[ 0 ].arguments[ 0 ])
    assert.equal(line.event, 'service.booted')
    assert.equal(line.service, 'spec-service')
    assert.deepEqual(line.owns, [ 'nothing' ])
})

test('isMain matches only the entry module', () => {
    assert.equal(isMain('file:///definitely/not/main.js'), false)
    assert.equal(isMain(new URL(process.argv[ 1 ], 'file:').href), true)
})
