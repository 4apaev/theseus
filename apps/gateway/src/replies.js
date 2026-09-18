// import { setTimeout } from 'node:timers/promises'
import { formatTime } from '@theseus/util'

/**
 * correlation waiter:
 *     http handlers park here until the event feed
 *     delivers a reply with a matching correlation_id,
 *     or the clock runs out.
 *
 *     timeout resolves undefined - the route picks its own fallback (202 / 504).
 *     register the wait BEFORE publishing:
 *         the memory broker delivers inline.
 *
 * @param {string | number} ttl
 * @return {import('../types/replies.js').Replies}
 */
export function createReplies(ttl = '5s') {
    const pending = new Map

    return {

        get size() { return pending.size },

        wait(coid, types, ms = ttl) {
            return new Promise(resolve => {
                const tid = setTimeout(() => {
                    pending.delete(coid)
                    resolve(void 0)
                }, formatTime(ms))

                pending.set(coid, {
                    types: new Set(types),
                    tid,
                    resolve,
                })
            })
        },

        settle(e) {
            const waiter = pending.get(e?.correlation_id)
            if (!waiter || !waiter.types.has(e.event_type))
                return false

            clearTimeout(waiter.tid)
            pending.delete(e.correlation_id)
            waiter.resolve(e)
            return true
        },
    }
}
