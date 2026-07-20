import { field } from './field.js'

export class Schema {
    static kind = 'events'
    name = 'Schema'

    constructor({ topic, type, key, payload, version = 1 }) {
        this.kind    = new.target.kind
        this.topic   = topic
        this.type    = type
        this.version = version
        this.key     = field.property(key)
        this.payload = payload
    }

    get slug() { return `${ this.topic }.${ this.type }.v${ this.version }` }
    get prop() { return this.slug.replaceAll('.', '_') }

    get [ Symbol.toStringTag ]() { return this.name }

    static is(x) { return this[ Symbol.hasInstance ](x) }
    static of()  { return Reflect.construct(this, arguments) }
}

export class Cmd extends Schema {
    static kind = 'commands'
    name = 'Cmd'
}

// ── commands ────────────────────────────────────────────────────────────────

export const playerRegisterRequested = new Cmd({
    topic  : 'player',
    type   : 'register.requested',
    key    : 'handle',
    payload: {
        handle  : field.nonEmptyString,
        password: field.nonEmptyString,
    },
})

export const playerLoginRequested = new Cmd({
    topic  : 'player',
    type   : 'login.requested',
    key    : 'handle',
    payload: {
        handle  : field.nonEmptyString,
        password: field.nonEmptyString,
    },
})

export const walletDebitRequested = new Cmd({
    topic  : 'wallet',
    type   : 'debit.requested',
    key    : 'pid',
    payload: {
        pid   : field.nonEmptyString,
        rfid  : field.nonEmptyString,
        amount: field.positiveNumber,
        reason: field.nonEmptyString,
    },
})

export const walletCreditRequested = new Cmd({
    topic  : 'wallet',
    type   : 'credit.requested',
    key    : 'pid',
    payload: {
        pid   : field.nonEmptyString,
        rfid  : field.nonEmptyString,
        amount: field.positiveNumber,
        reason: field.nonEmptyString,
    },
})

export const shipTravelRequested = new Cmd({
    topic  : 'ship',
    type   : 'travel.requested',
    key    : 'sid',
    payload: {
        pid : field.nonEmptyString,
        sid : field.nonEmptyString,
        from: field.nonEmptyString,
        to  : field.nonEmptyString,
    },
})

export const cargoLoadRequested = new Cmd({
    topic  : 'cargo',
    type   : 'load.requested',
    key    : 'sid',
    payload: {
        gid     : field.nonEmptyString,
        pid     : field.nonEmptyString,
        sid     : field.nonEmptyString,
        stid    : field.nonEmptyString,
        rfid    : field.nonEmptyString,
        quantity: field.positiveInteger,
    },
})

export const cargoUnloadRequested = new Cmd({
    topic  : 'cargo',
    type   : 'unload.requested',
    key    : 'sid',
    payload: {
        gid     : field.nonEmptyString,
        pid     : field.nonEmptyString,
        sid     : field.nonEmptyString,
        stid    : field.nonEmptyString,
        rfid    : field.nonEmptyString,
        quantity: field.positiveInteger,
    },
})

export const marketBuyRequested = new Cmd({
    topic  : 'market',
    type   : 'buy.requested',
    key    : 'stid',
    payload: {
        gid           : field.nonEmptyString,
        pid           : field.nonEmptyString,
        sid           : field.nonEmptyString,
        stid          : field.nonEmptyString,
        quantity      : field.positiveInteger,
        price_unit_max: field.positiveNumber,
    },
})

export const marketSellRequested = new Cmd({
    topic  : 'market',
    type   : 'sell.requested',
    key    : 'stid',
    payload: {
        gid           : field.nonEmptyString,
        pid           : field.nonEmptyString,
        sid           : field.nonEmptyString,
        stid          : field.nonEmptyString,
        quantity      : field.positiveInteger,
        price_unit_min: field.positiveNumber,
    },
})

// ── events ──────────────────────────────────────────────────────────────────

export const playerCreated = new Schema({
    topic  : 'player',
    type   : 'created',
    key    : 'pid',
    payload: {
        pid   : field.nonEmptyString,
        handle: field.nonEmptyString,
    },
})

export const playerRegistrationRejected = new Schema({
    topic  : 'player',
    type   : 'registration.rejected',
    key    : 'handle',
    payload: {
        handle: field.nonEmptyString,
        reason: field.nonEmptyString,
    },
})

export const playerLoginSucceeded = new Schema({
    topic  : 'player',
    type   : 'login.succeeded',
    key    : 'pid',
    payload: {
        pid   : field.nonEmptyString,
        handle: field.nonEmptyString,
    },
})

export const playerLoginRejected = new Schema({
    topic  : 'player',
    type   : 'login.rejected',
    key    : 'handle',
    payload: {
        handle: field.nonEmptyString,
        reason: field.nonEmptyString,
    },
})

export const walletCreated = new Schema({
    topic  : 'wallet',
    type   : 'created',
    key    : 'pid',
    payload: {
        pid    : field.nonEmptyString,
        balance: field.nonNegativeNumber,
    },
})

export const walletDebited = new Schema({
    topic  : 'wallet',
    type   : 'debited',
    key    : 'pid',
    payload: {
        pid    : field.nonEmptyString,
        rfid   : field.nonEmptyString,
        amount : field.positiveNumber,
        balance: field.nonNegativeNumber,
    },
})

export const walletCredited = new Schema({
    topic  : 'wallet',
    type   : 'credited',
    key    : 'pid',
    payload: {
        pid    : field.nonEmptyString,
        rfid   : field.nonEmptyString,
        amount : field.positiveNumber,
        balance: field.nonNegativeNumber,
    },
})

export const walletTransactionRejected = new Schema({
    topic  : 'wallet',
    type   : 'transaction.rejected',
    key    : 'pid',
    payload: {
        pid   : field.nonEmptyString,
        rfid  : field.nonEmptyString,
        amount: field.positiveNumber,
        reason: field.nonEmptyString,
    },
})

export const shipCreated = new Schema({
    topic  : 'ship',
    type   : 'created',
    key    : 'sid',
    payload: {
        pid     : field.nonEmptyString,
        sid     : field.nonEmptyString,
        stid    : field.nonEmptyString,
        name    : field.nonEmptyString,
        capacity: field.positiveInteger,
        velocity: field.velocity,
    },
})

export const shipDeparted = new Schema({
    topic  : 'ship',
    type   : 'departed',
    key    : 'sid',
    payload: {
        pid      : field.nonEmptyString,
        sid      : field.nonEmptyString,
        from     : field.nonEmptyString,
        to       : field.nonEmptyString,
        arrives  : field.isoTime,
        departed : field.isoTime,
        years_abs: field.positiveNumber,
        years_rel: field.positiveNumber,
    },
})

export const shipArrived = new Schema({
    topic  : 'ship',
    type   : 'arrived',
    key    : 'sid',
    payload: {
        pid    : field.nonEmptyString,
        sid    : field.nonEmptyString,
        stid   : field.nonEmptyString,
        arrived: field.isoTime,
    },
})

export const shipTravelRejected = new Schema({
    topic  : 'ship',
    type   : 'travel.rejected',
    key    : 'sid',
    payload: {
        pid   : field.nonEmptyString,
        sid   : field.nonEmptyString,
        reason: field.nonEmptyString,
    },
})

export const cargoLoaded = new Schema({
    topic  : 'cargo',
    type   : 'loaded',
    key    : 'sid',
    payload: {
        gid     : field.nonEmptyString,
        pid     : field.nonEmptyString,
        sid     : field.nonEmptyString,
        stid    : field.nonEmptyString,
        quantity: field.positiveInteger,
    },
})

export const cargoUnloaded = new Schema({
    topic  : 'cargo',
    type   : 'unloaded',
    key    : 'sid',
    payload: {
        gid     : field.nonEmptyString,
        pid     : field.nonEmptyString,
        sid     : field.nonEmptyString,
        stid    : field.nonEmptyString,
        quantity: field.positiveInteger,
    },
})

export const cargoOperationRejected = new Schema({
    topic  : 'cargo',
    type   : 'operation.rejected',
    key    : 'sid',
    payload: {
        gid     : field.optionalNonEmptyString,
        pid     : field.nonEmptyString,
        sid     : field.nonEmptyString,
        reason  : field.nonEmptyString,
        quantity: field.optionalPositiveInteger,
    },
})

export const tradeExecuted = new Schema({
    topic  : 'market',
    type   : 'trade.executed',
    key    : 'stid',
    payload: {
        gid        : field.nonEmptyString,
        pid        : field.nonEmptyString,
        sid        : field.nonEmptyString,
        stid       : field.nonEmptyString,
        tid        : field.nonEmptyString,
        quantity   : field.positiveInteger,
        price_total: field.positiveNumber,
        price_unit : field.positiveNumber,
        side       : field.has('buy', 'sell'),
    },
})

export const tradeRejected = new Schema({
    topic  : 'market',
    type   : 'trade.rejected',
    key    : 'stid',
    payload: {
        gid     : field.nonEmptyString,
        pid     : field.nonEmptyString,
        sid     : field.nonEmptyString,
        stid    : field.nonEmptyString,
        quantity: field.positiveInteger,
        reason  : field.nonEmptyString,
        side    : field.has('buy', 'sell'),
    },
})

export const marketPriceChanged = new Schema({
    topic  : 'market',
    type   : 'price.changed',
    key    : 'stid',
    payload: {
        gid       : field.nonEmptyString,
        stid      : field.nonEmptyString,
        price_buy : field.positiveNumber,
        price_sell: field.positiveNumber,
    },
})
