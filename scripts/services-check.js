import { readFileSync, statSync } from 'node:fs'

import { fmtDuration } from '@theseus/util'

import * as Gateway    from '@theseus/gateway'
import * as Player     from '@theseus/player-service'
import * as Ship       from '@theseus/ship-service'
import * as Market     from '@theseus/market-service'
import * as Projection from '@theseus/projection-service'

const services = [
    [ 'gateway'   , Gateway ],
    [ 'player'    , Player ],
    [ 'ship'      , Ship ],
    [ 'market'    , Market ],
    [ 'projection', Projection ],
]

const rows = services.map(([ name, srv ]) => {
    const { role, owns } = srv.describeService()
    return { service: name, role, owns: owns.join(', '), ...liveness(name) }
})

console.table(rows)
rows.some(r => r.status !== 'up') && process.exit(1)

// a service that's up has a live pid in .logs/<name>.pid - start.sh
// writes it at boot, stop.sh reads it the same way to shut down
function liveness(name) {
    try {
        const file = `.logs/${ name }.pid`
        const pid  = Number(readFileSync(file, 'utf8'))
        process.kill(pid, 0)
        return { status: 'up', pid, uptime: fmtDuration(Date.now() - statSync(file).mtimeMs) }
    }
    catch {
        return { status: 'down', pid: '-', uptime: '-' }
    }
}
