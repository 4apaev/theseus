import type { Pool, Client, QueryResult } from 'pg'

export interface Mod {
    gid: string
    slot: string
}

// the ships mirror. an event's payload carries only some of these
// fields - pid, stid, from, to, and fitted are present only where
// the source event has them.
export interface Ship {
    sid: string
    pid?: string
    stid?: string | null
    from?: string | null
    to?: string | null
    fitted?: Mod[]
}

// the shape a message takes going in, to insertMessage.
export interface Mssg {
    mid: string
    from: string
    to: string | null
    stid: string | null
    body: string
    sent: string
    deliver: string
    delivered: string | null
}

// updateMessages' RETURNING row. pg returns a timestamp column as
// a Date, not a string.
export interface DueMssg {
    mid: string
    from: string
    to: string | null
    body: string
    delivered: Date
}

// stid is set for a docked ship. from/to are set for a transiting
// one - never both at once.
export interface QRShip {
    sid: string
    pid: string
    stid: string | null
    from: string | null
    to: string | null
    status: string
    has_ansible: boolean
}

export function insertShip(pool: Pool, data: Ship): Promise<QueryResult>
export function shipDeparted(pool: Pool, data: Ship): Promise<void>
export function shipArrived(pool: Pool, data: Ship): Promise<void>
export function shipRigChanged(pool: Pool, data: Ship): Promise<void>
export function shipByPid(client: Client, pid: string): Promise<QRShip | undefined>
export function updateMessages(client: Client): Promise<DueMssg[]>
export function insertMessage(client: Client, data: Mssg): Promise<QueryResult>
export function hasAnsible(fitted: Mod[]): boolean
