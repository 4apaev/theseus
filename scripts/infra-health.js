import net from 'node:net'
import { readEnv } from '@theseus/config'

const timeout = readEnv('HEALTH_TIMEOUT', 1500)

const checks = await Promise.all([
    check('kafka'   , readEnv('KAFKA_HOST'   , '127.0.0.1'), readEnv('KAFKA_PORT'   , 9092)),
    check('postgres', readEnv('PG_HOST'      , '127.0.0.1'), readEnv('PG_PORT'      , 5432)),
    // check('kafka-ui', readEnv('KAFKA_UI_HOST', '127.0.0.1'), readEnv('KAFKA_UI_PORT', 8080)),
])

for (let x of checks) {
    console.table(x)
    x.ok || process.exit(1)
}

function check(name, host, port) {
    return new Promise(done => {
        const soc = net.createConnection({ host, port })
        const end = ok => {
            soc.destroy()
            done({ ok, name, host, port })
        }

        soc.setTimeout(timeout)
        soc.once('connect', () => end(true))
        soc.once('error'  , () => end(false))
        soc.once('timeout', () => end(false))
    })
}
