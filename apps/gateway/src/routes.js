/* eslint-disable camelcase */

import { Garage } from 'garage'
import { Is, Fail, guid } from '@theseus/util'
import { createCommandRecord } from '@theseus/kafka'
import {
    commandTree as CMD,
    eventTree as EVT,
    createCommandEnvelope,
} from '@theseus/contracts'

const BODY_LIMIT = 65536

export function createRoutes({
    jwt,
    waiter,
    queries,
    producer,
    service = 'gateway',
}) {

    const app = new Garage({
        name: service,
        onerror(e, rq, rs) {
            e.code >= 500 && console.error(e)
            rs.headersSent || rs.json(
                e.code === 417
                    ? 400
                    : e.code,
                { error: e.message },
            )
        },
    })

    // ── middleware ───────────────────────────────────────────

    function auth(rq, rs, next) {
        const [ scheme, token ] = rq.get('authorization').split(' ')

        scheme === 'Bearer' && token || Fail.raise(401, 'missing bearer token')

        rq.claims = jwt.verify(token)
        return next()
    }

    async function json(rq, rs, next) {
        rq.size > BODY_LIMIT && Fail.raise(413, 'body too large')

        await rq.reader()
        if (rq.error)
            throw rq.error

        if (Is.s(rq.body) || Is.B(rq.body)) {
            try {
                rq.body = JSON.parse(rq.body)
            }
            catch {
                Fail.raise(400, 'invalid json body')
            }
        }
        Is.o(rq.body) || Fail.raise(400, 'invalid json body')
        return next()
    }

    // ── commands ─────────────────────────────────────────────

    function command(command_type, payload) {
        return createCommandEnvelope({
            cmd         : guid(),
            requested_by: service,
            command_type,             // validation failure → Fail 417 → http 400
            payload,
        })
    }

    async function publish(cmd) {
        await producer.publish(createCommandRecord(cmd))
    }

    function accepted(rs,   { cmd, correlation_id }) {
        return rs.json(202, { cmd, correlation_id })
    }
    /*
        register the waiter, then publish - the memory broker in tests
        delivers the reply before publish() resolves  */
    async function publishAndWait(cmd, types) {
        const reply = waiter.wait(cmd.correlation_id, types)
        await publish(cmd)
        return reply
    }

    app.post('/register', json, async (rq, rs) => {
        const { handle, password } = rq.body
        const cmd = command(CMD.player.register.requested, { handle, password })

        const e = await publishAndWait(cmd, [
            EVT.player.created,
            EVT.player.registration.rejected,
        ])

        if (!e) return accepted(rs, cmd)
        e.event_type === EVT.player.created
            ? rs.json(201, e.payload)
            : Fail.raise(409, e.payload.reason)
    })

    app.post('/login', json, async (rq, rs) => {
        const { handle, password } = rq.body
        const cmd = command(CMD.player.login.requested, { handle, password })

        const e = await publishAndWait(cmd, [
            EVT.player.login.succeeded,
            EVT.player.login.rejected,
        ])

        e                                           || Fail.raise(504, 'login timed out')
        e.event_type === EVT.player.login.succeeded || Fail.raise(401, e.payload.reason)

        const { pid, handle: h } = e.payload
        rs.json(200, { token: jwt.sign({ pid, handle: h }), pid, handle: h })
    })

    // pid always comes from the token, never from the body
    app.post('/travel', auth, json, async (rq, rs) => {
        const { sid, from, to } = rq.body
        const cmd = command(CMD.ship.travel.requested, { pid: rq.claims.pid, sid, from, to })
        await publish(cmd)
        accepted(rs, cmd)
    })

    app.post('/buy', auth, json, async (rq, rs) => {
        const { gid, sid, stid, quantity, price_unit_max } = rq.body
        const cmd = command(CMD.market.buy.requested, {
            pid: rq.claims.pid, gid, sid, stid, quantity, price_unit_max,
        })
        await publish(cmd)
        accepted(rs, cmd)
    })

    app.post('/sell', auth, json, async (rq, rs) => {
        const { gid, sid, stid, quantity, price_unit_min } = rq.body
        const cmd = command(CMD.market.sell.requested, {
            pid: rq.claims.pid, gid, sid, stid, quantity, price_unit_min,
        })
        await publish(cmd)
        accepted(rs, cmd)
    })

    // ── queries ──────────────────────────────────────────────

    app.get('/me', auth, async (rq, rs) => {
        const row = await queries.me(rq.claims.pid)
        row || Fail.raise(404, 'player not found')
        rs.json(200, row)
    })

    app.get('/ships', auth, async (rq, rs) => {
        rs.json(200, await queries.ships(rq.claims.pid))
    })

    app.get('/cargo/:sid', auth, async (rq, rs) => {
        rs.json(200, await queries.cargo(rq.params.sid, rq.claims.pid))
    })

    app.get('/market/:stid', auth, async (rq, rs) => {
        rs.json(200, await queries.market(rq.params.stid))
    })

    app.get('/trades', auth, async (rq, rs) => {
        rs.json(200, await queries.trades(rq.claims.pid))
    })

    app.use((rq, rs) => rs.json(404, { error: 'not found' }))

    return app
}
