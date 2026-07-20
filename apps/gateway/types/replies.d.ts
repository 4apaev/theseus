import type { AnyEventEnvelope } from '@theseus/contracts'

export interface Replies {
    readonly size: number

    /** resolves the matching reply event, or undefined on timeout */
    wait(correlationId: string, types: string[], ms?: string | number): Promise<AnyEventEnvelope | undefined>

    /** true when a pending wait matched and was resolved */
    settle(e: AnyEventEnvelope): boolean
}

export function createReplies(ttl?: string | number): Replies
