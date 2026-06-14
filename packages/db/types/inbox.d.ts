import type { Pool } from 'pg'

export interface Inbox {
    has(id: string): boolean | Promise<boolean>
    mark(id: string): true | Promise<true>
}

export declare class MemoryInbox extends Set<string> implements Inbox {
    name: string
    mark(id: string): true
    readonly [Symbol.toStringTag]: string
    static identity(msg: unknown): string | undefined
    static of(...args: unknown[]): MemoryInbox
}

export function createMemoryInbox(): MemoryInbox
export function createInbox(pool: Pool): Inbox

declare const _default: {
    memory: typeof createMemoryInbox
    create: typeof createInbox
}
export default _default
