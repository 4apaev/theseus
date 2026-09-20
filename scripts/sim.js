import { run, parseArgs } from '@theseus/sim'

/*  the cli. the harness lives in packages/sim.
    npm run sim -- --players 30 --minutes 10 --seed 42  */

const { html, broken } = await run(parseArgs())
console.log('sim ⋮ report %s', html)

// a broken invariant fails the run, so this drops into ci unchanged
process.exit(+!!broken.length)
