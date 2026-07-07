import { DB } from '@theseus/db'
import { isMain } from '@theseus/config'
import { commandTopics, eventTopics } from '@theseus/contracts'
import Service from '@theseus/service'

import { seed as seedMarkets } from './seed.js'
import { createHandlers } from './handlers.js'

export class Market extends Service {
    static schema     = 'market'
    static service    = 'market-service'
    static migrations = new URL('../migrations', import.meta.url)
    static topics     = [ commandTopics.market, eventTopics.wallet, eventTopics.ship ]
    static owns       = [ 'cargo', 'trades', 'markets', 'station_inventory' ]
    static role       =   'station markets, prices, inventory, and trade sagas'

    seed() {
        return seedMarkets(this.pool, DB.transact)
    }

    handlers() {
        return createHandlers(this.pool, DB.transact)
    }
}

export const service = Market.service
export const describeService = () => Market.describe()
export const start = client => Market.of({ client }).start()
export default start

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && Market.run()
