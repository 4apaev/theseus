export type Validator = (value: unknown) => boolean

export interface FittedSlot {
    slot: string
    gid: string
}

export declare const field: Readonly<{
    property: typeof keyBy
    isoTime: Validator
    nonEmptyString: Validator
    nonNegativeNumber: Validator
    oneOf(a: readonly unknown[]): Validator
    has(...a: readonly unknown[]): Validator
    optionalNonEmptyString: Validator
    optionalPositiveInteger: Validator
    positiveInteger: Validator
    positiveNumber: Validator
    velocity: Validator
    shipName: Validator
    arrayOf(v: Validator): Validator
    nonEmptyArrayOf(v: Validator): Validator
    shape(spec: Record<string, Validator>): Validator
    fittedSlots: Validator
    reasons: Validator
}>

export function assertKnownDefinition<T>(definitions: Readonly<Record<string, T>>, type: string, label: string): T
export function keyBy(fieldName: string): (payload: Record<string, unknown>) => string
export function validateEnvelope<T extends object>(envelope: T, spec: object): T
export function validatePayload<T extends object>(definition: object, payload: T): T
