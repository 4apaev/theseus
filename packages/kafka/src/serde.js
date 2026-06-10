export function encodeJson(value) {
    return Buffer.from(JSON.stringify(value), 'utf8')
}

export function decodeJson(value) {
    return JSON.parse(value.toString('utf8'))
}
