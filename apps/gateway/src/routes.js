/* eslint-disable camelcase */
import Pt from 'node:path'
import { fileURLToPath } from 'node:url'
import Garage from 'garage'
import { O, Is, Fail, guid, pick } from '@theseus/util'
import {
    hulls,
    goods,
    cargoLoad,
    previewRig,
    previewExchange,
    universeData,
} from '@theseus/domain'

import { createCommandRecord } from '@theseus/kafka'
import {
    CMD, EVT,
    createCommandEnvelope,
} from '@theseus/contracts'

/**
 * @typedef { import('garage').MWare } MWare
 * @typedef { import('garage').GarageOptions } GarageOpt
 */

const BODY_LIMIT = 0x10000

// browser-safe subset of garage's source
// served so the client can `import ... from 'garage/x'`
const GARAGE_DIR = Pt.dirname(fileURLToPath(import.meta.resolve('garage')))

export function createRoutes({
    jwt,
    waiter,
    queries,
    rebuild,
    producer,
    service = 'gateway',
    clientPath,
    nodeEnv = 'dev',
}) {

    /** @type { GarageOpt['onerror'] } */
    function onerror(e, rq, rs) {
        e.code >= 500 && console.error(e)
        rs.headersSent || rs.json(e.code === 417 ? 400 : e.code, { error: e.message })
    }

    /** @type  { Garage } */
    const gw = new Garage({ name: service, onerror })

    // ── middleware ───────────────────────────────────────────

    const PUB_DIR = Pt.resolve(Pt.dirname(clientPath))

    /** @type { MWare } */
    async function log(rq, rs, next) {
        const start = performance.now()
        await next()
        console.log(
            // (new Date).toLocaleString('en-gb', { hour12: false }),
            rs.status,
            rq.method,
            rq.url,
            (performance.now() - start).toFixed(1).padEnd(4),
        )
    }

    /** @type { MWare } */
    function auth(rq, rs, next) {
        const [ scheme, token ] = rq.get('authorization').split(/ +/)
        scheme == 'Bearer' && token || Fail.raise(401, 'missing bearer token')

        rq.claims = jwt.verify(token)
        return next()
    }

    /**
     * @param  { string } role
     * @return { MWare  }
     */
    function requireRole(role) {
        return (rq, rs, next) => {
            rq.claims.role === role || Fail.raise(403, 'forbidden')
            return next()
        }
    }

    /** @type { MWare } */
    async function json(rq, rs, next) {
        rq.size > BODY_LIMIT && Fail.raise(413, 'body too large')

        await rq.reader()
        if (rq.error)
            throw rq.error

        Is.o(rq.body) || Fail.raise(400, 'invalid json body')
        return next()
    }
    /**
     * @param  { string  }  base
     * @param  { Record<string, string> } [dict]
     * @return { MWare }
     */
    function frontend(base, dict) {
        O.setPrototypeOf(dict ??= {}, null)

        return (rq, rs) => {
            const path = Pt.join(base, dict[ rq.params.file ] ?? rq.params.file)
            return path.startsWith(base + Pt.sep)
                ? rs.file(path)
                : rs.send(404, 'not found')
        }
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

    /**
     * fires a command. with reply types, it waits for one and returns
     * it too. with none, it does not wait.
     *
     * @param  { string    } ct  - the command type
     * @param  { object    } pay - the command payload
     * @param  { ...string } et  - reply event types to wait for
     * @return { Promise<[ object, object | undefined ]> }
     */
    async function fire(ct, pay, ...et) {
        const cmd = command(ct, pay)
        const rs = et.length
            ? await publishAndWait(cmd, et)
            : await producer.publish(createCommandRecord(cmd))

        return [ cmd, rs ]
    }

    /**
     * builds a route handler for one command. the pid always comes
     * from the token. keys names the body fields to copy, space
     * separated. it never waits for a reply.
     *
     * @param  { { requested: string } } cmmd - the command's tree entry
     * @param  { number } [code] - the http status to reply with
     * @param  { string } [keys] - body fields to copy
     * @return { MWare }
     */
    function postCmd(cmmd, code, keys) {
        return async (rq, rs) => {
            const payload = {
                pid: rq.claims.pid,
                ...(keys
                    ? pick(rq.body, ...keys.match(/\w+/g))
                    : rq.body),
            }
            const cmd = command(cmmd.requested, payload)
            await producer.publish(createCommandRecord(cmd))

            rs.json(code ?? 202, { cmd: cmd.cmd, correlation_id: cmd.correlation_id })
        }
    }

    // TODO: add service prefix for routes. see docs/tech.debt.md#gateway
    // ── routes ───────────────────────────────────────────────

    // ── public: client + universe ───────────────────────────

    // per-request log line, off in test - tests fire many requests fast,
    // console spam for each one buys nothing there
    nodeEnv === 'test' || gw.use(log)

    gw.get('/universe' , (rq, rs) => rs.json(200, universeData))

    // ── static ───────────────────────────────────────────────

    gw.get('/', (rq, rs) => rs.file(clientPath))
    gw.get('/pub/:file(.*)', frontend(PUB_DIR))
    gw.get('/garage/:file(.*)', frontend(GARAGE_DIR, {
        constants : '/constants.js',
        mime      : '/mime.js',
        sync      : '/sync.js',
        use       : '/use.js',
        util      : '/util.js',
    }))

    // ── json  ────────────────────────────────────────────────

    gw.use('POST', 'DELETE', json)

    gw.post('/register', async (rq, rs) => {
        const [ cmd, e ] = await fire(
            CMD.player.register.requested, {
                handle: rq.body.handle,
                password: rq.body.password,
            },
            EVT.player.created,
            EVT.player.registration.rejected,
        )

        if (!e) return rs.json(202, { cmd: cmd.cmd, correlation_id: cmd.correlation_id })

        e.event_type === EVT.player.created || Fail.raise(409, e.payload.reason)

        return rs.json(201, e.payload)
    })

    gw.post('/login', async (rq, rs) => {

        const { login } = EVT.player

        const [ , e ] = await fire(
            CMD.player.login.requested,
            rq.body,
            login.succeeded,
            login.rejected,
        )

        e                                || Fail.raise(504, 'login timed out')
        e.event_type === login.succeeded || Fail.raise(401, e.payload.reason)

        const { pid, handle, role } = e.payload
        const token = jwt.sign({ pid, role, handle })

        rs.json(200, { pid, role, handle, token })
    })

    // ── auth  ────────────────────────────────────────────────

    gw.use(auth)

    // pid always comes from the token, never from the body

    gw.post('/travel'         , postCmd(CMD.ship.travel        , 202, 'sid from to'))
    gw.post('/rename'         , postCmd(CMD.ship.rename        , 202, 'sid name'))
    gw.post('/buy'            , postCmd(CMD.market.buy         , 202, 'gid sid stid quantity price_unit_max'))
    gw.post('/sell'           , postCmd(CMD.market.sell        , 202, 'gid sid stid quantity price_unit_min'))
    gw.post('/messages'       , postCmd(CMD.comms.send         , 202, 'to body'))
    gw.post('/modules/install', postCmd(CMD.ship.module.install, 202, 'sid slot gid'))
    gw.del('/modules/remove'  , postCmd(CMD.ship.module.remove , 202, 'sid slot'))

    // ── modules ──────────────────────────────────────────────

    /*
        preview publishes no command - it loads the projection's own
        hull/fitted/cargo and runs the same resolver ship-service does.
        it can be stale.
        the real command remains the authoritative check.
    */
    gw.post('/modules/preview', async (rq, rs) => {
        const { pid } = rq.claims
        const { gid, sid, slot } = rq.body
        const ship = (await queries.ships(rq.claims.pid)).find(s => s.sid === sid)
        ship || Fail.raise(404, 'ship not found')

        const fitted = O.from((await queries.modules(sid, pid)).map(r => [ r.slot, r.gid ]))

        const { proposed, stats, errors } = previewRig(
            hulls[ ship.hull ],
            fitted,
            { type: gid ? 'install' : 'remove', slot, gid },
            { docked: ship.status === 'docked' },
        )

        const cargo = await queries.cargo(sid, pid)
        const load  = previewExchange(cargoLoad(cargo, goods), goods, {
            incoming: gid || void 0,
            outgoing: fitted[ slot ],
        })
        load <= stats.capacity || errors.push('over capacity')

        rs.json(200, {
            proposed  : O.entries(proposed).map(([ slot, gid ]) => ({ slot, gid })),
            capacity  : stats.capacity,
            velocity  : stats.velocity,
            power     : stats.power.used,
            power_pool: stats.power.available,
            load,
            errors,
        })
    })

    // ── queries ──────────────────────────────────────────────

    gw.get('/me', async (rq, rs) => {
        const row = await queries.me(rq.claims.pid)
        row || Fail.raise(404, 'player not found')
        rs.json(200, row)
    })

    gw.get('/ships'             , async (rq, rs) => rs.json(200, await queries.ships(rq.claims.pid)))
    gw.get('/cargo/:sid'        , async (rq, rs) => rs.json(200, await queries.cargo(rq.params.sid, rq.claims.pid)))
    gw.get('/ships/:sid/modules', async (rq, rs) => rs.json(200, await queries.modules(rq.params.sid, rq.claims.pid)))
    gw.get('/market/:stid'      , async (rq, rs) => rs.json(200, await queries.market(rq.params.stid)))
    gw.get('/trades'            , async (rq, rs) => rs.json(200, await queries.trades(rq.claims.pid)))
    gw.get('/messages'          , async (rq, rs) => rs.json(200, await queries.messages(rq.claims.pid)))

    // ── public tier - any authenticated player ───────────────

    // one query serves both routes, so they cannot disagree
    gw.get('/traffic'            , async (rq, rs) => rs.json(200, await queries.traffic()))
    gw.get('/station/:stid/ships', async (rq, rs) => rs.json(200, await queries.traffic(rq.params.stid)))

    // ── admin ────────────────────────────────────────────────

    const admin = requireRole('admin')

    gw.get('/admin/players'        , admin, async (rq, rs) => rs.json(200, await queries.allPlayers()))
    gw.get('/admin/events'         , admin, async (rq, rs) => rs.json(200, await queries.eventLog()))
    gw.get('/admin/inventory/:stid', admin, async (rq, rs) => rs.json(200, await queries.inventory(rq.params.stid)))
    gw.post('/admin/rebuild'       , admin, async (rq, rs) => rs.json(200, { replayed: await rebuild() }))

    gw.use((rq, rs) => rs.json(404, { error: 'not found' }))

    console.log('gateway middleware size', gw.mware.length)

    return gw
}
