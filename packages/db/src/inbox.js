export class Inbox extends Set {
    name = 'Inbox'

    mark(id) {
        this.add(id)
        return true
    }

    get [ Symbol.toStringTag ]() {
        return this.name
    }

    static identity(msg) {
        return msg?.eid ?? msg?.cmd ?? void 0
    }

    static of = (...a) => Reflect.construct(this, a)
}

export function createInbox(pool) {
    return {
        async has(id) {
            const { rows } = await pool.query(
                'SELECT 1 FROM inbox WHERE eid = $1',
                [ id ],
            )
            return rows.length > 0
        },

        async mark(id) {
            await pool.query(
                'INSERT INTO inbox (eid) VALUES ($1) ON CONFLICT DO NOTHING',
                [ id ],
            )
            return true
        },
    }
}

export default {
    memory: Inbox.of,
    create: createInbox,
}
