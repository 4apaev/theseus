import type { Pool, PoolClient, QueryResult, QueryArrayResult } from 'pg'
import type { STmpl } from '@theseus/util'

export function withClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T>

export function insert<T>(client: PoolClient, table: string, data: T): [ string, T[ keyof T ][] ]
export function where<T>(table: string, query: T): [ string, T[ keyof T ][] ]
export function where<T>(query: T): [ string, T[ keyof T ][] ]
export function selectWhere<T>(table: string, query: T, ...keys: string[]): [ string, T[ keyof T ][] ]

export function Query(ctx: Pool | PoolClient): (tmpl: STmpl, ...subs: any[]) => Promise<QueryResult | QueryArrayResult>
