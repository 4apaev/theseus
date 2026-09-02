import { eventTree as EVT } from '@theseus/contracts'
import { O } from '@theseus/util'
import { createQueries } from './queries.js'

export function createHandlers(pool, transact) {
    const Q = createQueries(pool, transact)

    return O.ƒ({
        [ EVT.player.created         ]: Q.playerCreated,
        [ EVT.wallet.created         ]: Q.walletCreated,
        [ EVT.wallet.debited         ]: Q.walletBalance,
        [ EVT.wallet.credited        ]: Q.walletBalance,
        [ EVT.ship.created           ]: Q.shipCreated,
        [ EVT.ship.departed          ]: Q.shipDeparted,
        [ EVT.ship.arrived           ]: Q.shipArrived,
        [ EVT.ship.renamed           ]: Q.shipRenamed,
        [ EVT.ship.rig.changed       ]: Q.shipRigChanged,
        [ EVT.cargo.loaded           ]: Q.cargoLoaded,
        [ EVT.cargo.unloaded         ]: Q.cargoUnloaded,
        [ EVT.cargo.module.exchanged ]: Q.cargoModuleExchanged,
        [ EVT.trade.executed         ]: Q.tradeExecuted,
        [ EVT.market.price.changed   ]: Q.priceChanged,
    })
}
