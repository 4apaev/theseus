/** the fixed rfc 6455 handshake guid, identical on every websocket server */
export const MAGIC: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** frame opcodes: 0x0-0x7 data, 0x8-0xf control */
export const OP: {
    cont : 0x0
    text : 0x1
    bin  : 0x2
    close: 0x8
    ping : 0x9
    pong : 0xA
}

/** base64(sha1(key + MAGIC)) - the Sec-WebSocket-Accept value for a client key */
export function acceptKey(key: string): string

export interface FrameOptions {
    /** one of OP.* - default OP.text */
    opcode?: number
    /** true = act as a client: set the MASK bit, XOR the payload */
    mask?: boolean
}

/** one complete wire frame, FIN always set (no fragmentation) */
export function encodeFrame(payload: Buffer | string, opt?: FrameOptions): Buffer

/** a parsed frame - payload already unmasked */
export interface Frame {
    fin: boolean
    opcode: number
    masked: boolean
    payload: Buffer
    /** total bytes this frame took on the wire - header + key + payload */
    size: number
}

export interface FrameParser {
    /** feed a tcp chunk; onFrame fires once per completed frame */
    push(chunk: Buffer): void
}

export function createFrameParser(onFrame: (frame: Frame) => unknown): FrameParser
