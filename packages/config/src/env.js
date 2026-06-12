import { Fail } from 'garage/util'
// import { STATUS } from 'garage/constants'

export function readEnv(key, fallback = undefined) {
    const val = format(process.env[ key ])
    return val ?? fallback
}

export function requireEnv(key) {
    const val = readEnv(key)
    val ?? Fail.raise(416, `missing required env var: ${ key }`) // RANGE NOT SATISFIABLE
    return val
}

export function format(val) {
    if (val == null || val == '')
        return void 0

    let x = String(val).toLowerCase()
    if (x == 'true') return true
    if (x == 'false') return false
    return isNaN(+x)
        ? val
        : +x
}
