import { DB } from '@theseus/db'
import { isMain, readEnv } from '@theseus/config'
import { commandTopics, eventTopics } from '@theseus/contracts'
import Service from '@theseus/service'

import { seed as seedMarkets } from './seed.js'
import { createHandlers } from './handlers.js'
import { pollDrift } from './drift.js'

export class Market extends Service {
    static schema     = 'market'
    static service    = 'market-service'
    static migrations = new URL('../migrations', import.meta.url)
    static logEvents  = true    // event_log feeds scripts/rebuild-market-ships.js
    static topics     = [ commandTopics.market, commandTopics.cargo, eventTopics.wallet, eventTopics.ship ]
    static owns       = [ 'cargo', 'trades', 'markets', 'station_inventory' ]
    static role       =   'station markets, prices, inventory, and trade sagas'

    seed() {
        return seedMarkets(this.pool, DB.transact)
    }

    handlers() {
        return createHandlers(this.pool, DB.transact)
    }

    // stock drifts on its own, from each station's produce / consume
    // profile. this happens even with no trades. see drift.js.
    async start() {
        await super.start()
        this.drift = pollDrift(this.pool, DB.transact, {
            interval: readEnv('MARKET_DRIFT_INTERVAL', 1000),
        })
        return this
    }

    stop() {
        this.drift?.stop()
        super.stop()
    }
}

export { shipMirrorHandlers } from './handlers.js'

export const service = Market.service
export const describeService = () => Market.describe()
export const start = client => Market.of({ client }).start()
export default start

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && Market.run()
