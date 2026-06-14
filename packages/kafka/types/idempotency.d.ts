export default interface MemoryMessageStore extends Set<string> {
    mark(id: string): true
}

export function createMemoryMessageStore(): MemoryMessageStore
export function messageIdentity(msg: unknown): string | undefined
