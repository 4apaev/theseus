import { DB } from '@theseus/db'
import { isMain } from '@theseus/config'
import { commandTopics } from '@theseus/contracts'
import Service from '@theseus/service'
import { createHandlers } from './handlers.js'

export class Player extends Service {
    static schema     = 'player'
    static service    = 'player-service'
    static migrations = new URL('../migrations', import.meta.url)
    static topics     = [ commandTopics.player, commandTopics.wallet ]
    static owns       = [ 'players', 'wallets' ]
    static role       = 'players, sessions, and wallets'

    handlers() {
        return createHandlers(this.pool, DB.transact)
    }
}

export const service = Player.service
export const start   = client => Player.of({ client }).start()
export const describeService = () => Player.describe()
export default start

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && Player.run()
