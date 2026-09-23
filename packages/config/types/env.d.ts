/** an env value, after `format` coerces it */
export type EnvValue = string | number | boolean

/*
    the fallback sets the type. `format` coerces "20" to 20 and "true"
    to true, so the caller asks for the type it wants and reads it back.
    a wrong value in the environment stays a string at runtime.
*/
export function readEnv(name: string): EnvValue | undefined
export function readEnv(name: string, fallback: number): number
export function readEnv(name: string, fallback: boolean): boolean
export function readEnv(name: string, fallback: string): string

export function requireEnv(name: string): string

/** env text to a number, a boolean, or the text unchanged */
export function format(val: unknown): EnvValue | undefined
