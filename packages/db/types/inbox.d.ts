import type { Pool } from 'pg'

export interface IInbox {
    has(id: string): boolean | Promise<boolean>
    mark(id: string): true | Promise<true>
}

export declare class Inbox extends Set<string> implements IInbox {
    name: string
    mark(id: string): true
    readonly [ Symbol.toStringTag ]: string
    static identity(msg: unknown): string | undefined
    static of(...a: string[]): Inbox
}

export declare namespace Inbox {
    function memory(...a: string[]): Inbox
    function create(pool: Pool): IInbox
}

export function createInbox(pool: Pool): IInbox

export default Inbox
