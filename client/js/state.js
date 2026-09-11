export const KEY = 'theseus.token'

export const state = {
    token   : localStorage.getItem(KEY),
    alive   : false,
    wsTries : 0,

    universe: void 0,
    ship    : void 0,
    ws      : void 0,
    me      : void 0,

    cargo   : [],
    market  : [],
    trades  : [],
    fitted  : [],       // [{ slot, gid }] - GET /ships/:sid/modules

    traffic : new Map,   // sid → another player's ship, from GET /traffic
    pending : new Map,   // correlation_id → { label, el, timer }
}

/*  clear one player's data on logout.
    hydrate() refills state.me only when it is empty, so a stale value
    makes the next player read as the previous one - and mine() then
    treats their own ship as another player's.
    the universe is the same for everybody, so it stays. */
export function resetPlayer() {
    state.me      = void 0
    state.ship    = void 0
    state.cargo   = []
    state.market  = []
    state.trades  = []
    state.fitted  = []
    state.traffic = new Map
    for (const { timer } of state.pending.values()) clearTimeout(timer)
    state.pending = new Map
}

export function station(stid) {
    return state.universe?.stations.find(s => s.stid === stid)?.name
        ?? stid
        ?? '—'
}

export function good(gid) {
    return state.universe?.goods[ gid ]?.name ?? gid
}

// the module design behind a good id - family, mount, power, rates
export function design(gid) {
    return state.universe?.modules[ gid ]
}

// this function returns the cargo volume of one unit of a good
export function volume(gid) {
    return state.universe?.goods[ gid ]?.volume ?? 1
}

// this function computes the total load of the hold, quantity
// times volume for each good. market-service computes the same
// value in its own cargoLoad function. as a result, the shown
// number matches the number that the buy saga checks.
export function cargoLoad() {
    return state.cargo.reduce((n, c) => n + c.quantity * volume(c.gid), 0)
}

// the hull of our own ship, with its slots
export function hull() {
    return state.universe?.hulls[ state.ship?.hull ]
}

export function fittedAt(slot) {
    return state.fitted.find(f => f.slot === slot)?.gid
}
