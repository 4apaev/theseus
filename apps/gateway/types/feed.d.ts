import type { Duplex } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import type { AnyEventEnvelope } from '@theseus/contracts'

export interface FeedOptions {
    jwt: { verify(token: string): { pid: string } }
    /** keepalive interval - default '30s' */
    ping?: string | number
}

export interface Feed {
    /** wire to `server.on('upgrade')` - answers 101 or a plain http refusal */
    handleUpgrade(rq: IncomingMessage, socket: Duplex): void
    /**
     * one event becomes one text frame.
     * the owner sees it by payload.pid.
     * a price change reaches every socket.
     * a message reaches only its 2 participants, or its station's
     * currently-docked sockets.
     */
    push(e: AnyEventEnvelope): void
    stats(): { sockets: number }
    /** close-frame every socket (1001), stop the heartbeat */
    close(): void
}

export function createFeed(opt: FeedOptions): Feed
