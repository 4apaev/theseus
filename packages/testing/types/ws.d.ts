import type { Socket } from 'node:net'
import type { IncomingMessage } from 'node:http'

export interface WsConnectResult {
    rs: IncomingMessage
    /** present only on a successful 101 upgrade */
    socket?: Socket
}

/** raw rfc 6455 upgrade client for testing anything wired to `server.on('upgrade')` */
export function wsConnect(port: number, path?: string, headers?: Record<string, string>): Promise<WsConnectResult>
