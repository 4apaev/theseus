import type { AnyEventEnvelope } from '@theseus/contracts'

export interface FakeQuery {
    sql: string
    params?: unknown[]
}

export interface FakeClient {
    log: FakeQuery[]
    release(): void
    query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

export interface FakePool {
    client: FakeClient
    connect(): Promise<FakeClient>
    query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

// an ordered queue: call N gets overrides[N]. one entry answers every call;
// several entries are a fixed sequence, falling back to { rows: [] } past the end.
export type QueryOverrides = ((params?: unknown[]) => unknown)[]

// keyed by tablesOf(sql) - the sorted, +-joined set of tables a query
// touches (e.g. 'ships', 'cargo+ships'), parsed from the sql itself.
export type TableOverrides = Record<string, (params?: unknown[]) => unknown>

export function fakeClient(overrides?: QueryOverrides): FakeClient
export function fakePool(overrides?: QueryOverrides): FakePool
export function fakeTableClient(overrides?: TableOverrides): FakeClient
export function fakeTablePool(overrides?: TableOverrides): FakePool
export function fakeTransact(client: FakeClient): <T>(pool: unknown, fn: (client: FakeClient) => T | Promise<T>) => T | Promise<T>
export function outboxEvents(client: FakeClient): AnyEventEnvelope[]
export function makeCmd(payload: object, extra?: object): {
    cmd: string
    correlation_id: string
    payload: object
}
