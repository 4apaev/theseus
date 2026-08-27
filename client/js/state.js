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

    traffic : new Map,   // sid → another player's ship, from GET /traffic
    pending : new Map,   // correlation_id → { label, el }
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
    state.traffic = new Map
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
