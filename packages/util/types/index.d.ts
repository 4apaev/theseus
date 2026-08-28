export * from 'garage/util'
export * as Constants from 'garage/constants'

// ── Codec ────────────────────────────────────────────────────

export function encodeJson(value: unknown): Buffer
export function decodeJson<T = unknown>(value: Buffer | string): T

export declare const Codec: {
    encode: typeof encodeJson
    decode: typeof decodeJson
}

// ─────────────────────────────────────────────────────────────

export interface Poller { stop(): void }
export function poll<A extends unknown[]>(fx: (...a: A) => Promise<unknown>, ms?: number | string, ...a: A): Poller

// ── String ───────────────────────────────────────────────────

export type STmpl = { raw: readonly string[] | ArrayLike<string> }

export function Raw<T>(s: string | STmpl, a?: T | T[]): string
export function up(s: string): string
export function low(s: string): string
export function trim(s: string): string
export function camel2snake(s: string, ...a: string[]): string
export function guid(prefix?: string): string
export function formatTime(x: string | number): number
export function fmtDuration(ms: number): string

