import * as Gateway    from '@theseus/gateway'
import * as Projection from '@theseus/projection-service'
import * as Player     from '@theseus/player-service'
import * as Ship       from '@theseus/ship-service'
import * as Market     from '@theseus/market-service'

log(Gateway)
log(Player)
log(Ship)
log(Market)
log(Projection)

function log(srv) {
    const { service, role, owns, uptime } = srv.describeService()
    console.log('\n%s uptime:', service, uptime || 0, 'ms')
    console.log('\trole:', role)
    console.log('\towns:', ...owns)
}
