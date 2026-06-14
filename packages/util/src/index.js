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

export const Codec = {
    encode: encodeJson,
    decode: decodeJson,
}

export async function withClient(pool, fn) {
    const client = await pool.connect()
    try {
        return await fn(client)
    }
    finally {
        client.release()
    }
}

export function poll(fx, delay) {
    let rs, tid, stopped = 0

    async function tick() {
        rs = await fx()
        stopped || (tid = setTimeout(tick, delay))
    }

    tick()

    return {
        get result() { return rs },
        stop() {
            stopped = 1
            clearTimeout(tid)
        },
    }
}
