import * as Gateway    from '#apps/gateway/src/main.js'
import * as Market     from '#apps/market-service/src/main.js'
import * as Player     from '#apps/player-service/src/main.js'
import * as Projection from '#apps/projection-service/src/main.js'
import * as Ship       from '#apps/ship-service/src/main.js'

log(Gateway)
log(Player)
log(Ship)
log(Market)
log(Projection)

function log(srv) {
    const { service, role, owns } = srv.describeService()
    console.log('\n%s:', service, true)
    console.log('\trole:', role)
    console.log('\towns:', ...owns)
}
