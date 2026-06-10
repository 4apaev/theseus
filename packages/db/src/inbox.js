export function createMemoryInbox() {
    const seen = new Set

    return {
        has(eid) {
            return seen.has(eid)
        },

        mark(eid) {
            seen.add(eid)

            return true
        },
    }
}
