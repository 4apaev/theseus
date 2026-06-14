import type { Pool } from 'pg'

export interface IInbox {
    has(id: string): boolean | Promise<boolean>
    mark(id: string): true | Promise<true>
}

export declare class MemoryInbox extends Set<string> implements IInbox {
    name: string
    mark(id: string): true
    readonly [ Symbol.toStringTag ]: string
    static identity(msg: unknown): string | undefined
    static of(...args: unknown[]): MemoryInbox
}

export function createMemoryInbox(): MemoryInbox
export function createInbox(pool: Pool): IInbox

declare const Inbox: {
    memory: typeof createMemoryInbox
    create: typeof createInbox
}
export default Inbox
