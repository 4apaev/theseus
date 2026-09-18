import { fileURLToPath } from 'node:url'
import Pt                from 'node:path'

import Garage            from 'garage'

import { O, Fail       } from '@theseus/util'
import { CMD, EVT      } from '@theseus/contracts'

import {
    hulls,
    goods,
    cargoLoad,
    previewRig,
    previewExchange,
    universeData,
} from '@theseus/domain'

import {
    log,
    auth,
    json,
    frontend,
    requireRole,
} from './mware/index.js'

import { createCommands } from './commands.js'

const GARAGE_DIR = Pt.dirname(fileURLToPath(import.meta.resolve('garage'))) // browser-safe subset of garage's source

/**
 * @param {RoutesInput} input
 * @return {Garage}
 */
export function createRoutes({
    jwt,
    waiter,
    queries,
    rebuild,
    producer,
    clientPath,
    service = 'gateway',
    nodeEnv = 'dev',
}) {

    /** @type { GarageOpt['onerror'] } */
    function onerror(e, rq, rs) {
        e.code >= 500 && console.error(e)
        rs.headersSent || rs.json(e.code === 417 ? 400 : e.code, { error: e.message })
    }

    /** @type  { Garage } */
    const gw = new Garage({
        name: service,
        onerror,
    })

    const cmd = createCommands(service, producer, waiter)
    const PUB_DIR = Pt.resolve(Pt.dirname(clientPath))

    // ── routes ───────────────────────────────────────────────

    // ── public: client + universe ───────────────────────────

    nodeEnv === 'test' || gw.use(log) // per-request log line, off in test

    gw.get('/api/universe', (rq, rs) => rs.json(200, universeData))

    // ── static ───────────────────────────────────────────────

    gw.get('/', (rq, rs) => rs.file(clientPath))
    gw.get('/pub/:file(.*)'    , frontend(PUB_DIR))
    gw.get('/garage/:file(.*)' , frontend(GARAGE_DIR))

    // ── json  ────────────────────────────────────────────────

    gw.use('POST', 'PUT', json)

    gw.post('/api/auth/register', async (rq, rs) => {
        const [ c, e ] = await cmd.fire(
            CMD.player.register.requested, {
                handle: rq.body.handle,
                password: rq.body.password,
            },
            EVT.player.created,
            EVT.player.registration.rejected,
        )

        if (!e) return rs.json(202, { cmd: c.cmd, correlation_id: c.correlation_id })

        e.event_type === EVT.player.created || Fail.raise(409, e.payload.reason)

        return rs.json(201, e.payload)
    })

    gw.post('/api/auth/login', async (rq, rs) => {

        const { login } = EVT.player

        const [ , e ] = await cmd.fire(
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

    gw.use(auth(jwt))

    gw.post('/api/ship/:sid/travel'      , cmd.route(CMD.ship.travel        , 202, 'from to'))
    gw.put('/api/ship/:sid/name'         , cmd.route(CMD.ship.rename        , 202, 'name'))
    gw.put('/api/ship/:sid/modules/:slot', cmd.route(CMD.ship.module.install, 202, 'gid'))
    gw.del('/api/ship/:sid/modules/:slot', cmd.route(CMD.ship.module.remove , 202))
    gw.post('/api/market/buy'            , cmd.route(CMD.market.buy         , 202, 'gid sid stid quantity price_unit_max'))
    gw.post('/api/market/sell'           , cmd.route(CMD.market.sell        , 202, 'gid sid stid quantity price_unit_min'))

    /*
        to is the recipient's sid, the same public id traffic and
        port already show. comms-service needs a pid - resolve it
        before the command fires. an unknown sid answers 404, the
        same as a ship route on a foreign or missing sid.
    */
    gw.post('/api/comms/messages', async (rq, rs) => {
        const { to, body } = rq.body
        const pid = to ? await queries.shipOwner(to) : void 0
        to && !pid && Fail.raise(404, 'ship not found')

        const [ c ] = await cmd.fire(CMD.comms.send.requested, { pid: rq.claims.pid, to: pid, body })
        rs.json(202, { cmd: c.cmd, correlation_id: c.correlation_id })
    })

    // ── modules ──────────────────────────────────────────────

    /*
        preview publishes no command - it loads the projection's own
        hull/fitted/cargo and runs the same resolver ship-service does.
        it can be stale.
        the real command remains the authoritative check.
    */
    gw.post('/api/ship/:sid/modules/preview', async (rq, rs) => {
        const { pid } = rq.claims
        const { sid } = rq.params
        const { gid, slot } = rq.body
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
            proposed    : O.entries(proposed).map(([ slot, gid ]) => ({ slot, gid })),
            capacity    : stats.capacity,
            velocity    : stats.velocity,
            acceleration: stats.acceleration,
            power       : stats.power.used,
            power_pool  : stats.power.available,
            load,
            errors,
        })
    })

    // ── queries ──────────────────────────────────────────────

    gw.get('/api/player/me', async (rq, rs) => {
        const row = await queries.me(rq.claims.pid)
        row || Fail.raise(404, 'player not found')
        rs.json(200, row)
    })

    gw.get('/api/ship'                 , async (rq, rs) => rs.json(200, await queries.ships(rq.claims.pid)))
    gw.get('/api/ship/:sid/cargo'      , async (rq, rs) => rs.json(200, await queries.cargo(rq.params.sid, rq.claims.pid)))
    gw.get('/api/ship/:sid/modules'    , async (rq, rs) => rs.json(200, await queries.modules(rq.params.sid, rq.claims.pid)))
    gw.get('/api/station/:stid/market' , async (rq, rs) => rs.json(200, await queries.market(rq.params.stid)))
    gw.get('/api/market/trades'        , async (rq, rs) => rs.json(200, await queries.trades(rq.claims.pid)))
    gw.get('/api/comms/messages'       , async (rq, rs) => rs.json(200, await queries.messages(rq.claims.pid)))

    // ── public tier - any authenticated player ───────────────

    // one query serves both routes, so they cannot disagree
    gw.get('/api/ship/traffic'        , async (rq, rs) => rs.json(200, await queries.traffic()))
    gw.get('/api/station/:stid/ships' , async (rq, rs) => rs.json(200, await queries.traffic(rq.params.stid)))

    // ── admin ────────────────────────────────────────────────

    const admin = requireRole('admin')

    gw.get('/api/admin/players'        , admin, async (rq, rs) => rs.json(200, await queries.allPlayers()))
    gw.get('/api/admin/events'         , admin, async (rq, rs) => rs.json(200, await queries.eventLog()))
    gw.get('/api/admin/inventory/:stid', admin, async (rq, rs) => rs.json(200, await queries.inventory(rq.params.stid)))
    gw.post('/api/admin/rebuild'       , admin, async (rq, rs) => rs.json(200, { replayed: await rebuild() }))

    gw.use((rq, rs) => rs.json(404, { error: 'not found' }))

    console.log('gateway middleware size', gw.mware.length)

    return gw
}

/**
 * @typedef { import('garage').MWare                   } MWare
 * @typedef { import('garage').GarageOptions           } GarageOpt
 * @typedef { import('../types/routes.js').RoutesInput } RoutesInput
 */
