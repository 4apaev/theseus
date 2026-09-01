// import Buffer from 'node:buffer'
export * from 'garage/util'
export * as Constants from 'garage/constants'

import {
    A,
    AQuery,
    FQuery,
} from 'garage/util'
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
export function nil<T>(x: T): T
export function now(ms?: number): () => number
export function waitFor<F extends (...a: any[]) => Promise<any>>(
    fx: F,
    ms?: string | number,
    delay?: string | number,
    ...args: Parameters<F>
): ReturnType<F>

export function sleep<T>(ms?: string | number, x?: T): Promise<T>
export function findWhere<T>(it: ArrayLike<T>, query: AQuery<T>, ctx?: unknown): T
export function where<T>(it: ArrayLike<T>, query: AQuery<T>, ctx?: unknown): T