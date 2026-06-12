export interface MemoryMessageStore {
    has(id: string): boolean
    mark(id: string): true
    size(): number
}

export function createMemoryMessageStore(): MemoryMessageStore
export function messageIdentity(value: unknown): string | undefined
