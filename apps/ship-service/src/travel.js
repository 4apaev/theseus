import { readEnv  } from '@theseus/config'
import { universe } from '@theseus/domain'

const TIME_SCALE = readEnv('TIME_SCALE', 20)

export default travel
export function travel(from, to, velocity) {
    const ly      = distance(from, to)
    const abs     = ly / velocity
    const rel     = abs * Math.sqrt(1 - velocity ** 2)
    const ms      = abs * TIME_SCALE * 1000
    const arrives = new Date(Date.now() + ms).toISOString()

    return {
        ms,
        arrives,
        years_abs: abs,
        years_rel: rel,
    }
}

export const distance = travel.distance = universe.distance.bind(universe)
