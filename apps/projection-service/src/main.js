import { isMain } from '@theseus/config'
import { eventTopics as Evt } from '@theseus/contracts'
import Service from '@theseus/service'

import { createHandlers } from './handlers.js'

export class Projection extends Service {
    static schema     = 'projection'
    static service    = 'projection-service'
    static outbox     = false   // consume only - read models emit nothing
    static migrations = new URL('../migrations', import.meta.url)
    /*
        the concrete topics, NOT events.all: outbox rows carry a single
        topic, so on a real broker events.all never receives anything
    */
    static topics = [ Evt.player, Evt.wallet, Evt.ship, Evt.cargo, Evt.market ]
    static owns   = [ 'event_log', 'read_models' ]
    static role   =   'event log and disposable read models'

    handlers() {
        return createHandlers(this.pool)
    }
}

export const service = Projection.service
export const describeService = () => Projection.describe()

export const start = client => new Projection({ client }).start()
export default start

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && Projection.run()
