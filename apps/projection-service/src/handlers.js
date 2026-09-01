import { eventTree as EVT } from '@theseus/contracts'
import { O } from '@theseus/util'
import { createQueries } from './queries.js'

export function createHandlers(pool) {
    const Q = createQueries(pool)

    return O.ƒ({
        [ EVT.player.created        ]: Q.playerCreated,
        [ EVT.wallet.created        ]: Q.walletCreated,
        [ EVT.wallet.debited        ]: Q.walletBalance,
        [ EVT.wallet.credited       ]: Q.walletBalance,
        [ EVT.ship.created          ]: Q.shipCreated,
        [ EVT.ship.departed         ]: Q.shipDeparted,
        [ EVT.ship.arrived          ]: Q.shipArrived,
        [ EVT.ship.renamed          ]: Q.shipRenamed,
        [ EVT.cargo.loaded          ]: Q.cargoLoaded,
        [ EVT.cargo.unloaded        ]: Q.cargoUnloaded,
        [ EVT.trade.executed        ]: Q.tradeExecuted,
        [ EVT.market.price.changed  ]: Q.priceChanged,
    })
}
