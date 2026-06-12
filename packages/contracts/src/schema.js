import { O, A, Is, Fail, each } from 'garage/util'

const CODE = 417 // EXPECTATION FAILED

export const keyBy = A.prop

export const field = Object.freeze({
    nonEmpty      : isNonEmpty,
    nonEmptyString: isNonEmptyString,
    oneOf(a)                   { return x => a.includes(x) },
    isoTime(x)                 { return isNonEmptyString(x) && Is.n(Date.parse(x)) },
    optionalNonEmptyString(x)  { return x == null || isNonEmptyString(x) },
    optionalPositiveInteger(x) { return x == null || field.positiveInteger(x) },
    nonNegativeNumber(x)       { return Is.n(x) && x >= 0 },
    positiveInteger(x)         { return Is.N(x) && x > 0 },
    positiveNumber(x)          { return Is.n(x) && x > 0 },
    velocity(x)                { return Is.n(x) && x > 0 && x < 1 },
})

export function freezeDefinitions(items) {
    return O.freeze(O.from(items.map(item => [
        item.type,
        O.freeze(item),
    ])))
}

export function freezeMap(pairs) {
    return O.freeze(O.from(pairs))
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

export function requireField(envelope, key, validator) {
    validator(envelope[ key ])
        || Fail.raise(CODE, `envelope.${ key } is invalid`)
}
