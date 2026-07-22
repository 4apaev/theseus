import type { Duplex } from 'node:stream'
import type { IncomingMessage } from 'node:http'

export interface WssOptions<Meta = unknown> {
    /** returns per-connection metadata, or throws/rejects to send a plain 401 before the 101 */
    authenticate?(rq: IncomingMessage): Meta | Promise<Meta>
    /** keepalive interval - default '30s' */
    ping?: string | number
}

export interface Wss<Meta = unknown> {
    /** wire to `server.on('upgrade')` - answers 101 or a plain http refusal */
    handleUpgrade(rq: IncomingMessage, socket: Duplex): void
    /** guarded raw write of an already-encoded frame (see encodeFrame) */
    send(socket: Duplex, frame: Buffer): void
    /** iterate live connections with their authenticate() metadata */
    each(fn: (meta: Meta, socket: Duplex) => void): void
    stats(): { sockets: number }
    /** close-frame every socket (1001), stop the heartbeat */
    close(): void
}

export function createWss<Meta = unknown>(opt?: WssOptions<Meta>): Wss<Meta>
