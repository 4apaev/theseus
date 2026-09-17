import { DB                         } from '@theseus/db'
import { isMain, readEnv            } from '@theseus/config'
import { commandTopics, eventTopics } from '@theseus/contracts'
import Service                        from '@theseus/service'

import pollDelivery   from './delivery.js'
import createHandlers from './handlers.js'

export class Comms extends Service {
    static schema     = 'comms'
    static service    = 'comms-service'
    static migrations = new URL('../migrations', import.meta.url)
    static topics     = [ commandTopics.comms, eventTopics.ship ]
    static owns       = [ 'ships', 'messages' ]
    static role       =   'station chat and the ansible - player to player messaging'

    handlers() {
        return createHandlers(this.pool, DB.transact)
    }

    // the ansible's delay is a due time, already stored on the row.
    // this is the same restart-safe shape ship-service's arrivals
    // poll uses.
    async start() {
        await super.start()

        this.delivery = pollDelivery(this.pool, DB.transact, {
            interval: readEnv('COMMS_DELIVERY_INTERVAL', 1000),
        })
        return this
    }

    stop() {
        this.delivery?.stop()
        super.stop()
    }
}

export { shipMirrorHandlers } from './handlers.js'

export const service = Comms.service
export const describeService = () => Comms.describe()
export const start = client => Comms.of({ client }).start()
export default start

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && Comms.run()
