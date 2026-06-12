export interface MemoryInbox {
    has(eventId: string): boolean
    mark(eventId: string): true
}

export function createMemoryInbox(): MemoryInbox
