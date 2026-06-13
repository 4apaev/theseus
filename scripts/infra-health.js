import net from 'node:net'

import { readEnv } from '#packages/config/src/index.js'

const timeout = readEnv('HEALTH_TIMEOUT', 1500)

const checks = [
    {
        name: 'kafka',
        host: readEnv('KAFKA_HOST', '127.0.0.1'),
        port: readEnv('KAFKA_PORT', 9092),
    },
    {
        name: 'postgres',
        host: readEnv('PG_HOST', '127.0.0.1'),
        port: readEnv('PG_PORT', 5432),
    },
    {
        name: 'kafka-ui',
        host: readEnv('KAFKA_UI_HOST', '127.0.0.1'),
        port: readEnv('KAFKA_UI_PORT', 8080),
    },
]

const results = await Promise.all(checks.map(checkPort))
results.forEach(log)

if (!results.every(r => r.ok))
    process.exitCode = 1

function checkPort(check) {
    return new Promise(resolve => {

        const soc = net.createConnection({
            host: check.host,
            port: check.port,
        })

        const done = ok => {
            soc.destroy()
            resolve({ ...check, ok })
        }

        soc.setTimeout(timeout)
        soc.once('connect', () => done(true))
        soc.once('error'  , () => done(false))
        soc.once('timeout', () => done(false))
    })
}

function log({ ok, name, host, port }) {
    const status = ok
        ? 'ok'
        : 'down'
    console.log(name, status, host, port)
}
