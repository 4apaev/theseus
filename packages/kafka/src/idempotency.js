import { Is } from 'garage/util'

export function createMemoryMessageStore() {
    const seen = new Set

    return {
        has(id) {
            return seen.has(id)
        },

        mark(id) {
            seen.add(id)
            return true
        },

        size() {
            return seen.size
        },
    }
}

export function messageIdentity(value) {
    return Is.o(value)
        ? value.eid ?? value.cmd
        : void 0
}
