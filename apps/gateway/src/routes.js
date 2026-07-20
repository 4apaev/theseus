/* eslint-disable camelcase */

import { Garage } from 'garage'
import { Is, Fail, guid } from '@theseus/util'
import { createCommandRecord } from '@theseus/kafka'
import {
    commandTree as CMD,
    eventTree as EVT,
    createCommandEnvelope,
} from '@theseus/contracts'

const BODY_LIMIT = 0x10000

export function createRoutes({
    jwt,
    waiter,
    queries,
    producer,
    service = 'gateway',
}) {

    const gw = new Garage({
        name: service,
        onerror(e, rq, rs) {
            e.code >= 500 && console.error(e)
            rs.headersSent || rs.json(e.code === 417 ? 400 : e.code, { error: e.message })
        },
    })

    // ── middleware ───────────────────────────────────────────

    function auth(rq, rs, next) {
        const [ scheme, token ] = rq.get('authorization').split(/ +/)

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

    /*
        register the waiter, then publish - the memory broker in tests
        delivers the reply before publish() resolves  */
    async function publishAndWait(cmd, types) {
        const reply = waiter.wait(cmd.correlation_id, types)
        await producer.publish(createCommandRecord(cmd))
        return reply
    }

    // ── routes ───────────────────────────────────────────────

    // use json for every post route
    gw.post(json)

    gw.post('/register', async (rq, rs) => {
        const { handle, password } = rq.body
        const cmd = command(CMD.player.register.requested, { handle, password })

        const e = await publishAndWait(cmd, [
            EVT.player.created,
            EVT.player.registration.rejected,
        ])

        if (!e) return rs.json(202, { cmd: cmd.cmd, correlation_id: cmd.correlation_id }) // accepted(rs, cmd)
        e.event_type === EVT.player.created
            ? rs.json(201, e.payload)
            : Fail.raise(409, e.payload.reason)
    })

    gw.post('/login', async (rq, rs) => {
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

    // use auth for every other route
    gw.use(auth)

    // pid always comes from the token, never from the body
    gw.post('/travel', async (rq, rs) => {
        const { sid, from, to } = rq.body
        const cmd = command(CMD.ship.travel.requested, { pid: rq.claims.pid, sid, from, to })
        await producer.publish(createCommandRecord(cmd))
        rs.json(202, { cmd: cmd.cmd, correlation_id: cmd.correlation_id })
    })

    gw.post('/buy', async (rq, rs) => {
        const { gid, sid, stid, quantity, price_unit_max } = rq.body
        const cmd = command(CMD.market.buy.requested, {
            pid: rq.claims.pid, gid, sid, stid, quantity, price_unit_max,
        })
        await producer.publish(createCommandRecord(cmd))
        rs.json(202, { cmd: cmd.cmd, correlation_id: cmd.correlation_id })
        // accepted(rs, cmd)
    })

    gw.post('/sell', async (rq, rs) => {
        const { gid, sid, stid, quantity, price_unit_min } = rq.body
        const cmd = command(CMD.market.sell.requested, {
            pid: rq.claims.pid,
            gid,
            sid,
            stid,
            quantity,
            price_unit_min,
        })
        await producer.publish(createCommandRecord(cmd))
        rs.json(202, { cmd: cmd.cmd, correlation_id: cmd.correlation_id })
        // accepted(rs, cmd)
    })

    // ── queries ──────────────────────────────────────────────

    gw.get('/me', async (rq, rs) => {
        const row = await queries.me(rq.claims.pid)
        row || Fail.raise(404, 'player not found')
        rs.json(200, row)
    })

    gw.get('/ships', async (rq, rs) => {
        rs.json(200, await queries.ships(rq.claims.pid))
    })

    gw.get('/cargo/:sid', async (rq, rs) => {
        rs.json(200, await queries.cargo(rq.params.sid, rq.claims.pid))
    })

    gw.get('/market/:stid', async (rq, rs) => {
        rs.json(200, await queries.market(rq.params.stid))
    })

    gw.get('/trades', async (rq, rs) => {
        rs.json(200, await queries.trades(rq.claims.pid))
    })

    gw.use((rq, rs) => rs.json(404, { error: 'not found' }))

    return gw
}
