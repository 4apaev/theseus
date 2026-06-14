export function encodeJson(value: unknown): Buffer
export function decodeJson<T = unknown>(value: Buffer | string): T

export default interface Codec {
    encode: typeof encodeJson,
    decode: typeof decodeJson,
}
