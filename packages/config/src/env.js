export function readEnv(name, fallback = undefined) {
    const value = process.env[ name ]

    if (value == null || value == '')
        return fallback

    return value
}

export function requireEnv(name) {
    const value = readEnv(name)

    if (value == null)
        throw new Error(`missing required env var: ${ name }`)

    return value
}
