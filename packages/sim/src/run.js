import { execFile           } from 'node:child_process'
import { parseArgs as parse } from 'node:util'
import { promisify          } from 'node:util'

import Sync from 'garage/sync'

import { readEnv } from '@theseus/config'
import { A, O, each, sleep } from '@theseus/util'

import { DB } from '@theseus/db'

import { Stats  } from './stats.js'
import { sweep  } from './cleanup.js'
import { Player } from './player.js'
import { report } from './report.js'

import * as dice from './players/dice.js'

/*
    a load and data run against a LIVE stack - infra up, npm start done.

        npm run sim -- --players 30 --minutes 10 --seed 42

    every player registers, opens the websocket feed, then plays until
    the clock runs out. the brain is a player module, dice by default.
    the report separates what the sim asked for from what the game
    answered, because the ask is a weight in players/ and the answer is
    the game itself.
*/

const REPLY_TIMEOUT = 15_000

export function parseArgs(argv = process.argv.slice(2)) {
    const { values: v } = parse({
        args   : argv,
        options: {
            players: { short: 'p', type: 'string', default: '10' },
            minutes: { short: 'm', type: 'string', default: '2' },
            seed   : { short: 's', type: 'string' },
            base   : { type: 'string', default: `http://127.0.0.1:${ readEnv('GATEWAY_PORT', 3000) }` },
            out    : { type: 'string', default: '.reports' },

            clean  : { type: 'boolean', default: false },

            'time-scale'   : { type: 'string' },
            'market-drift' : { type: 'string' },
            'interest-rate': { type: 'string' },
        },
    })
    return {
        players: +v.players,
        minutes: +v.minutes,
        seed   : +(v.seed ?? Date.now() % 1e6),
        base   : v.base,
        out    : v.out,
        clean  : v.clean,
        tune   : defined({
            TIME_SCALE           : v[ 'time-scale' ],
            MARKET_DRIFT_INTERVAL: v[ 'market-drift' ],
            INTEREST_RATE        : v[ 'interest-rate' ],
        }),
    }
}

// only the flags the caller gave - the rest keep whatever .env holds
function defined(x) {
    const out = {}
    each(x, (k, v) => v === void 0 || (out[ k ] = v))
    return out
}

/*  the world's tempo. drift runs on the wall clock and travel does not,
    so the 2 only keep their ratio when they move together. a run at one
    tempo does not compare to a run at another - the report carries it.  */
export function tempo(tune = {}) {
    const scale = +(tune.TIME_SCALE ?? readEnv('TIME_SCALE', 20))
    const drift = +(tune.MARKET_DRIFT_INTERVAL ?? readEnv('MARKET_DRIFT_INTERVAL', 1000))
    return {
        time_scale     : scale,
        drift_interval : drift,
        interest_rate  : +(tune.INTEREST_RATE ?? readEnv('INTEREST_RATE', 0.05)),
        drift_per_year : +(scale * 1000 / drift).toFixed(2),
    }
}

/*  services read the env at boot, so a new tempo needs a restart.
    a shell variable beats --env-file, so the children see these.  */
async function retune(tune) {
    const run = promisify(execFile)
    const env = { ...process.env, ...tune }

    console.log('sim ⋮ retune %o - restarting services', tune)
    await run('bash', [ 'scripts/stop.sh' ], { env })
    await run('bash', [ 'scripts/start.sh' ], { env })
}

// mulberry32 - a seeded run repeats, so a failure repeats with it
export function rng(seed) {
    let a = seed >>> 0
    return () => {
        a = a + 0x6D2B79F5 | 0
        let t = Math.imul(a ^ a >>> 15, 1 | a)
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
        return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
}

export async function run(opt = parseArgs(), brain = dice) {
    const stats = new Stats
    const rand  = rng(opt.seed)

    O.keys(opt.tune ?? {}).length && await retune(opt.tune)

    const clock = tempo(opt.tune)
    const stamp = Date.now()

    console.log('sim ⋮ tempo %o', clock)

    Sync.base = opt.base
    Sync.head = new Headers({ 'content-type': 'application/json' })

    const peers = A.fill(opt.players, i =>
        new Player(`sim_${ opt.seed }_${ i }`, opt.base, stats, rng(opt.seed + i + 1)))

    console.log('sim ⋮ %d players, %d min, seed %d', opt.players, opt.minutes, opt.seed)

    for (const p of peers) {
        await p.join() || console.log('sim ⋮ %s failed to join', p.handle)
        await p.connect()
    }
    console.log('sim ⋮ all players online')

    // check if `util/now` can be used
    const until = Date.now() + opt.minutes * 60_000
    let ticks = 0

    while (Date.now() < until) {
        await Promise.all(peers.map(p => brain.turn(p, peers, stats)))
        ticks++
        await sleep(200 + rand() * 300)
    }

    // a command with no event is the interesting failure, so wait once
    await sleep(REPLY_TIMEOUT)
    stats.timeouts = peers.reduce((n, p) => n + p.pending.size, 0)
    peers.forEach(p => p.close())

    console.log('sim ⋮ %d ticks, %d requests', ticks, stats.http.length)
    const out = await report(stats, { ...opt, ticks, stamp, clock, ranMs: opt.minutes * 60_000 })

    /*  the report already holds the numbers, so the rows can go. it
        sweeps this run's own handles, never another run's.  */
    opt.clean && await clean(opt.seed)

    return out
}

async function clean(seed) {
    const pool = DB.create({ schema: 'projection' })
    try {
        const rows = await sweep(pool, `sim_${ seed }_`)
        console.log('sim ⋮ swept %d rows', rows.reduce((n, r) => n + r.rows, 0))
    }
    finally {
        await pool.end()
    }
}
