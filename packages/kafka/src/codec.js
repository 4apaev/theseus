export function encodeJson(value) {
    return Buffer.from(
        JSON.stringify(value),
        'utf8',
    )
}

export function decodeJson(value) {
    return JSON.parse(
        Buffer.isBuffer(value)
            ? value.toString('utf8')
            : value,
    )
}

export default {
    encode: encodeJson,
    decode: decodeJson,
}
