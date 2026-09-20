import Sync from 'garage/sync'

import { O, Is, echo, sleep } from '@theseus/util'

/*
    one player's transport: http through Sync, the websocket feed, and
    the book of commands still waiting for their event. it holds no
    strategy - that lives in players/.
*/

/**
 * @typedef {{ cmd: string, action: string, sent: number }} Pending
 */

export class Player {
    constructor(handle, base, stats, rand) {
        this.handle = handle
        this.base   = base
        this.stats  = stats
        this.rand   = rand
        this.pending = /** @type { Map<string, Pending> } */ (new Map)
        this.ship = void 0
        this.token = ''
        this.stale = true
        this.polled = 0
    }

    /*  Sync rejects on any non-2xx, and echo settles both sides, so one
        path handles an answer and a refusal alike  */
    async req(method, path, body) {
        const t0 = performance.now()
        const rq = new Sync(method, path, body)

        this.token && rq.set('authorization', `Bearer ${ this.token }`)

        const pay   = await rq.then(echo, echo)
        const ms    = performance.now() - t0
        const status = pay.status ?? pay.code ?? 0

        this.stats.request(method, path, status, ms)
        pay.ok || this.stats.error(path, status, pay.body?.error ?? pay.message ?? 'no body')
        return { ok: Boolean(pay.ok), status, body: pay.body ?? O.o }
    }

    async join(password = 'secret123') {
        await this.req('POST', '/api/auth/register', { handle: this.handle, password })
        const { body } = await this.req('POST', '/api/auth/login', { handle: this.handle, password })
        this.token = body.token
        return Boolean(this.token)
    }

    /*  the socket carries the answer to every command. a 202 only says
        the gateway took it - the event says what the game did with it  */
    connect() {
        const url = this.base.replace(/^http/, 'ws') + `/api/feed?token=${ this.token }`
        this.ws = new WebSocket(url)
        this.ws.onmessage = m => this.settle(JSON.parse(m.data))
        this.ws.onerror = () => this.stats.error('ws', 0, 'socket error')
        return new Promise(done => {
            this.ws.onopen = () => done(true)
            sleep(5000).then(() => done(false))
        })
    }

    settle(e) {
        const p = this.pending.get(e.correlation_id)
        if (!p) return

        this.pending.delete(e.correlation_id)
        this.stale = true
        this.stats.answer(e.event_type, p.action, performance.now() - p.sent)
    }

    /** a 202 parks here until its event lands, or until the clock beats it */
    track(action, body) {
        body?.correlation_id
        && this.pending.set(body.correlation_id, { cmd: body.cmd, action, sent: performance.now() })
    }

    /*  a real client re-reads after an event, not before every click.
        a poll per action buries the game's own traffic in the mix  */
    async hydrate() {
        if (!this.stale && this.ship) return this.ship

        const { body } = await this.req('GET', '/api/ship')
        this.ship = Is.a(body) ? body[ 0 ] : void 0
        this.stale = false
        this.polled = Date.now()
        return this.ship
    }

    close() {
        this.ws?.close()
    }
}

// ── the actions ──────────────────────────────────────────────
