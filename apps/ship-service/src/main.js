import { DB } from '@theseus/db'
import { isMain } from '@theseus/config'
import { commandTopics, eventTopics } from '@theseus/contracts'
import Service from '@theseus/service'
import { createHandlers } from './handlers.js'

export class Ship extends Service {
    static schema     = 'ship'
    static service    = 'ship-service'
    static migrations = new URL('../migrations', import.meta.url)
    static topics     = [ commandTopics.ship, eventTopics.player ]
    static owns       = [ 'ships' ]
    static role       =   'ships, travel, locations, and cargo holds'

    handlers() {
        return createHandlers(this.pool, DB.transact)
    }
}

export const service = Ship.service
export const describeService = () => Ship.describe()

export const start = client => new Ship({ client }).start()
export default start

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && Ship.run()
