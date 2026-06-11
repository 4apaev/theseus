import { describeService as describeGateway    } from '../apps/gateway/src/main.js'
import { describeService as describeMarket     } from '../apps/market-service/src/main.js'
import { describeService as describePlayer     } from '../apps/player-service/src/main.js'
import { describeService as describeProjection } from '../apps/projection-service/src/main.js'
import { describeService as describeShip       } from '../apps/ship-service/src/main.js'

const services = [
    describeGateway(),
    describePlayer(),
    describeShip(),
    describeMarket(),
    describeProjection(),
]

for (const service of services)
    console.log(`${ service.service } ok`)
