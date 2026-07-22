import Http        from 'node:http'
import { Codec   } from '@theseus/util'
import { readEnv } from '@theseus/config'
import {
    OP,
    encodeFrame,
    createFrameParser,
} from '@theseus/ws'

/*
    connect to the gateway websocket feed
    and print pushed events.
        node --env-file=./.env scripts/ws-probe.js <token>

    grab a token first:
        curl -s localhost:3000/login -d '{"handle":"…","password":"…"}'
*/

const token = process.argv[ 2 ]
if (!token) {
    console.error('missing token\nusage: node scripts/ws-probe.js <token>')
    process.exit(1)
}

const port = readEnv('GATEWAY_PORT', 3000)

const rq = Http.request({
    port,
    path   : `/?token=${ token }`,
    headers: {
        connection         : 'Upgrade',
        upgrade            : 'websocket',
        'sec-websocket-key': Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64'),
    },
})

rq.on('response', rs => {
    console.error('rejected:', rs.statusCode)
    process.exit(1)
})

rq.on('upgrade', (rs, soc) => {
    console.log('connected to ws://localhost:%d - waiting for events (ctrl-c to quit)', port)

    const parser = createFrameParser(frame => {
        switch (frame.opcode) {
            case OP.ping : return soc.write(encodeFrame(frame.payload, { opcode: OP.pong, mask: true }))
            case OP.text : return console.log(Codec.decode(frame.payload))
            case OP.close: return process.exit(0)
        }
    })

    soc.on('data', chunk => parser.push(chunk))
    soc.on('close', () => process.exit(0))
})

rq.end()
