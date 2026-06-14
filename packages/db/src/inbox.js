export default class Inbox extends Set {
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
