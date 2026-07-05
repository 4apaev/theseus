export default class Store extends Set {
    name = 'Store'

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
