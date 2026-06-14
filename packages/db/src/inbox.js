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

    static of() {
        return Reflect.construct(this, arguments)
    }
}

export function createMemoryInbox() {
    return new Inbox
}

export function createInbox(pool) {
    return {
        async has(id) {
            const { rows } = await pool.query(
                'select 1 from inbox where eid = $1',
                [ id ],
            )
            return rows.length > 0
        },

        async mark(id) {
            await pool.query(
                'insert into inbox (eid) values ($1) on conflict do nothing',
                [ id ],
            )
            return true
        },
    }
}

export default {
    memory: createMemoryInbox,
    create: createInbox,
}
