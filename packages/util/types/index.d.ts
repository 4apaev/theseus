export function encodeJson(value: unknown): Buffer
export function decodeJson<T = unknown>(value: Buffer | string): T

export declare const Codec: {
    encode: typeof encodeJson
    decode: typeof decodeJson
}

export function withClient<T>(
    pool: { connect(): Promise<{ release(): void }> },
    fn: (client: unknown) => Promise<T>,
): Promise<T>

export interface Poller {
    stop(): void
}

export function poll(fx: () => Promise<void>, delay: number): Poller
