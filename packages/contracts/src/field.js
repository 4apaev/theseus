import { O, A, Is, Fail, each } from 'garage/util'

const CODE = 417 // EXPECTATION FAILED

export const keyBy = A.prop

const SHIP_NAME = /^[\p{L}\p{N} '.-]{1,24}$/u  // TODO: add regex explanation

// one fitted slot on the wire: { slot, gid } - see docs/modules.md
const fittedSlotShape = shape({ slot: isNonEmptyString, gid: isNonEmptyString })

export const field = Object.freeze({
    property      : A.prop,
    nonEmpty      : isNonEmpty,
    nonEmptyString: isNonEmptyString,
    oneOf(a)                   { return x => a.includes(x) },
    has(...a)                  { return field.oneOf(a) },
    isoTime(x)                 { return isNonEmptyString(x) && Is.n(Date.parse(x)) },
    optionalNonEmptyString(x)  { return x == null || isNonEmptyString(x) },
    optionalPositiveInteger(x) { return x == null || field.positiveInteger(x) },
    nonNegativeNumber(x)       { return Is.n(x) && x >= 0 },
    positiveInteger(x)         { return Is.N(x) && x > 0 },
    positiveNumber(x)          { return Is.n(x) && x > 0 },
    velocity(x)                { return Is.n(x) && x > 0 && x < 1 },
    shipName(x)                { return isNonEmptyString(x) && SHIP_NAME.test(x) && x.trim() === x },
    arrayOf,
    nonEmptyArrayOf,
    shape,
    fittedSlots: arrayOf(fittedSlotShape),
    reasons    : nonEmptyArrayOf(isNonEmptyString),
})

// array/shape combinators - reusable, and how fittedSlots/reasons above
// are themselves built
function arrayOf(v)         { return x => Is.a(x) && x.every(v) }
function nonEmptyArrayOf(v) { return x => Is.a(x) && x.length > 0 && x.every(v) }
function shape(spec)        { return x => Is.T('Object', x) && O.keys(spec).every(k => spec[ k ](x[ k ])) }

export function freezer(x) {
    return Is.x(x)
        ? each(x, (k, v) => freezer(v), O.freeze(O.setPrototypeOf(x, null)))
        : x
}

export function freeze(items) {
    let defs = O.o
    let vals = O.o

    for (let item of items) {
        defs[ item.slug ] = O.freeze(O.ƒ(item))
        vals[ item.prop ] = item.slug
    }
    return [ defs, vals ].map(O.freeze)
}

export function assertKnownDefinition(definitions, type, label) {
    const definition = definitions[ type ]

    definition || Fail.raise(CODE, `unknown ${ label } type: ${ type }`)
    return definition
}

export function validateEnvelope(envelope, spec) {
    assertPlainObject(envelope, 'envelope')

    requireField(envelope, spec.id, field.nonEmptyString)
    requireField(envelope, spec.kind, field.nonEmptyString)
    requireField(envelope, spec.time, field.isoTime)

    for (const key of spec.required)
        requireField(envelope, key, isNonEmpty)

    return envelope
}

export function validatePayload(def, payload) {
    assertPlainObject(payload, 'payload')

    const errors = []

    each(def.payload, (key, validator) =>
        validator(payload[ key ]) || errors.push(key))

    errors.length
        && Fail.raise(CODE, `${ def.type } invalid payload fields: ${ errors }`)
    return payload
}

export function requireField(envelope, key, validator) {
    validator(envelope[ key ])
        || Fail.raise(CODE, `envelope.${ key } is invalid`)
}

function assertPlainObject(x, key) {
    Is.T('Object', x)
        || Fail.raise(CODE, `${ key } must be an object`)
}

function isNonEmptyString(x) {
    return Is.s(x) && x.length > 0
}

function isNonEmpty(x) {
    return x != null && x != ''
}
