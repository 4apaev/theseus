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

    pending : new Map,   // correlation_id → { label, el }
}

export function station(stid) {
    return state.universe?.stations.find(s => s.stid === stid)?.name
        ?? stid
        ?? '—'
}

export function good(gid) {
    return state.universe?.goods[ gid ]?.name ?? gid
}
