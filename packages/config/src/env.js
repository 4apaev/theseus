import { Fail } from 'garage/util'

process.loadEnvFile()

export function readEnv(key, fallback) {
    return format(process.env[ key ]) ?? fallback ?? void 0
}

export function requireEnv(key) {
    return readEnv(key)
    ?? Fail.raise(416, `missing required env var: ${ key }`) // RANGE NOT SATISFIABLE
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
