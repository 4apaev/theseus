import type {
    Pool,
    PoolClient,
    QueryResult,
    QueryArrayResult,
} from 'pg'

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
export function poll(fx: () => Promise<void>, ms?: number | string): Poller

// ── String ───────────────────────────────────────────────────

export type STmpl = { raw: readonly string[] | ArrayLike<string> }

export function Raw<T>(s: string | STmpl, a?: T | T[]): string
export function up(s: string): string
export function low(s: string): string
export function trim(s: string): string
export function camel2snake(s: string, ...a: string[]): string
export function formatTime(x: string | number): number


// ── DB ───────────────────────────────────────────────────────

export function withClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T>

export function where<T>(table: string, query: T): [ string, T[ keyof T ][] ]
export function where<T>(query: T): [ string, T[ keyof T ][] ]
export function selectWhere<T>(table: string, query: T, ...keys: string[]): [ string, T[ keyof T ][] ]

export function Query(ctx: Pool | PoolClient): (tmpl: STmpl, ...subs: any[]) => Promise<QueryResult | QueryArrayResult>

