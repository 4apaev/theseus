/* eslint-disable camelcase */
import { state } from './state.js'
import { drawnShips, dockedAt } from './traffic.js'
import {
    $,
    cr,
    esc,
    fmtDist,
    fmtYears,
} from './dom.js'

// gate on the universe, not on our ship. a player with no ship must
// still see the map, and the other ships on it.
export function renderTravel() {
    const body = $.id('travelBody')
    if (!state.universe) return body.innerHTML = '<p class="dim">—</p>'

    const { pos, centers } = stationLayout()
    const edges = uniqueEdges(state.universe.routes)

    body.innerHTML = `
        <svg viewBox="0 0 360 270" class="map">
            <g class="mapRoutes">${ routeLines(edges, pos) }</g>
            <g class="mapSystems">${ systemLabels(centers) }</g>
            <g class="mapStations">${ mapStations(pos, centers, state.ship) }</g>
            <g class="mapShips">${ shipMarkers(pos) }</g>
        </svg>`
}

/*  a dot for each ship in transit, plus our own ship always.
    docked ships are not dots. many dots at one station make one pile
    that nobody can read. the station tooltip lists them instead. */
function shipMarkers(pos) {
    return drawnShips().map(s => {
        const p   = shipPos(pos, s)
        const own = s === state.ship
        return `<circle
            class="shipMarker${ own ? ' own' : '' }"
            data-sid="${ esc(s.sid) }"
            cx="${ p.x }" cy="${ p.y }" r="${ own ? 4 : 3 }"
        ><title>${ esc(own ? 'you' : s.handle ?? 'a pilot') }</title></circle>`
    }).join('')
}

// move every marker. $('.shipMarker') alone returns the first one only.
export function tickShipMarkers() {
    if (!state.universe) return

    const { pos } = stationLayout()
    const ships   = new Map(drawnShips().map(s => [ s.sid, s ]))

    $('.shipMarker', dot => {
        const s = ships.get(dot.dataset.sid)
        if (s?.status === 'transit') {
            const p = shipPos(pos, s)
            dot.setAttribute('cx', p.x)
            dot.setAttribute('cy', p.y)
        }
    })
}

// ── layout ───────────────────────────────────────────────────

const CX = 180, CY = 135     // the middle of the viewBox
const RING = 92              // systems sit on this circle
const ORBIT = 28             // stations sit on this circle, around their system

let cachedFor, layoutCache

// state.universe is set once and never mutated - cache the layout against
// the reference itself so the 250ms transit tick doesn't redo the trig
function stationLayout() {
    if (cachedFor !== state.universe) {
        cachedFor   = state.universe
        layoutCache = layoutAll(state.universe)
    }
    return layoutCache
}

// an angle on a circle of n points.
// the first point is at the top.
function ring(i, n) {
    return 2 * Math.PI * i / n - Math.PI / 2
}

function onCircle(c, r, a) {
    return {
        x: c.x + r * Math.cos(a),
        y: c.y + r * Math.sin(a),
        a,
    }
}

/*  two levels. the systems sit on one big circle. the stations of a
    system sit on a small circle around it, in declaration order, which
    is orbit order. a system with one station puts it in the middle. */
function layoutAll({ systems, stations }) {
    const middle  = { x: CX, y: CY }
    const centers = new Map(systems.map((sys, i) =>
        [ sys.sysid, { ...onCircle(middle, RING, ring(i, systems.length)), sys }]))

    const pos = new Map
    for (const [ sysid, c ] of centers) {
        const inside = stations.filter(st => st.system === sysid)

        inside.length === 1
            ? pos.set(inside[ 0 ].stid, { ...c, solo: true })
            : inside.forEach((st, i) =>
                pos.set(st.stid, onCircle(c, ORBIT, ring(i, inside.length))))
    }
    return { pos, centers }
}

// the star, in the middle of a cluster. a system with one station has
// no room for it - that station carries the name itself.
function systemLabels(centers) {
    return [ ...centers.values() ].filter(c => !c.solo).map(c => `
        <text class="mapSystem" x="${ c.x }" y="${ c.y + 3 }">
            ${ esc(c.sys.name ?? c.sys.sysid) }
        </text>`).join('')
}

/*  a label on the rim of a cluster grows outward, away from the star.
    a label under a solo station sits below it, as before.
    without this the 6 names in Sol overlap into one smear. */
function labelPos(p) {
    if (p.solo) return { x: p.x, y: p.y + 14, anchor: 'middle' }

    const out = onCircle(p, 12, p.a)
    return {
        x     : out.x,
        y     : out.y + 3,
        anchor: anchorFor(Math.cos(p.a)),
    }
}

// a label on the left of the star ends at the star, one on the right
// starts there. a label at the top or bottom stays centred.
function anchorFor(dx) {
    if (dx < -0.1) return 'end'
    if (dx >  0.1) return 'start'
    return 'middle'
}

// ── routes ───────────────────────────────────────────────────

// every station reachable from `from`, any number of hops away. a plain
// BFS is enough - clickability only needs "is there a path", not the
// fastest one. the universe is small, so this is cheap to redo per render.
function reachableSet(from) {
    const seen  = new Set([ from ])
    const queue = [ from ]
    while (queue.length) {
        const stid = queue.shift()
        for (const route of state.universe.routes) {
            if (route.from === stid && !seen.has(route.to)) {
                seen.add(route.to)
                queue.push(route.to)
            }
        }
    }
    return seen
}

function uniqueEdges(routes) {
    const seen = new Set
    return routes.filter(r => {
        const key = [ r.from, r.to ].sort().join('|')
        return seen.has(key)
            ? false
            : (seen.add(key), true)
    })
}

// a route inside a system is short and needs no label - the line is
// only 28px long. the station tooltip carries the distance instead.
function routeLines(edges, pos) {
    return edges.map(r => {
        const a = pos.get(r.from)
        const b = pos.get(r.to)
        const local = r.c < 1

        const label = local
            ? ''
            : `<text class="mapLy" x="${ (a.x + b.x) / 2 }" y="${ (a.y + b.y) / 2 }">${ r.ly }ly</text>`

        return `
        <line
            class="mapRoute${ local ? ' local' : '' }"
            x1="${ a.x }" x2="${ b.x }"
            y1="${ a.y }" y2="${ b.y }"
        />${ label }`
    }).join('')
}

function routeInfo(route, ship) {
    const { time_scale, interest_rate } = state.universe.constants
    const v = Math.min(ship.velocity, route.c)

    const abs  = route.ly / v
    const rel  = abs * Math.sqrt(1 - v * v)
    const secs = Math.round(abs * time_scale)
    const cost = Number(state.me?.balance ?? 0) * (Math.pow(1 + interest_rate, abs) - 1)

    return `${
        fmtDist(route.ly) } · eta ${
        fmtYears(abs)     }yr (~${
        secs              }s) · you'd age ${
        fmtYears(rel)     }yr · ${
        cr(cost)          } time-cost`
}

// ── stations ─────────────────────────────────────────────────

// ship is undefined until the first ship exists - stay safe on every use
function mapStations(pos, centers, ship) {
    const docked    = ship?.status === 'docked'
    const reachable = docked && reachableSet(ship.stid)

    return state.universe.stations.map(port => {
        const p     = pos.get(port.stid)
        const label = labelPos(p)

        // a direct route gives the ly/eta/age preview. a station reached
        // through other hops is still clickable, just with no preview -
        // that would mean redoing path()'s time-weighted dijkstra here.
        const route = docked && state.universe.routes.find(r =>
            r.from === ship.stid && r.to === port.stid)

        const crew = dockedAt(port.stid)
        const cls  = [
            'mapStation',
            port.stid === ship?.stid && 'here',
            port.stid !== ship?.stid && reachable?.has?.(port.stid) && 'reachable',
            crew.length && 'busy',
        ].filter(Boolean).join(' ')

        return `<g
        class="${ cls }"
        data-stid="${ esc(port.stid) }">
        <circle r="${ p.solo ? 7 : 5 }" cx="${ p.x }" cy="${ p.y }" />
        <text class="mapLabel" x="${ label.x }" y="${ label.y }"
              text-anchor="${ label.anchor }">${ esc(port.name) }</text>
        <title>${ stationTitle(port, centers.get(port.system)?.sys, route && routeInfo(route, ship), crew) }</title>
    </g>`
    }).join('')
}

function stationTitle(port, sys, info, crew) {
    return [
        info
            ? `${ esc(port.name) } · ${ esc(info) }`
            : esc(port.name),
        sys && esc(`${ sys.name } · ${ sys.star }`),
        crew.length && `in port: ${ esc(crew.map(t => t.handle ?? '—').join(' · ')) }`,
    ].filter(Boolean).join('\n')
}

// ── ship position ────────────────────────────────────────────

function shipPos(pos, ship) {
    if (ship.status === 'docked')
        return pos.get(ship.stid)

    const a = pos.get(ship.from)
    const b = pos.get(ship.to)
    const f = transitFraction(ship)

    return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
    }
}

function transitFraction(ship) {
    const scale     = state.universe.constants.time_scale * 1000
    const arrivesAt = Date.parse(ship.arrives)
    const departsAt = arrivesAt - ship.years_abs * scale
    return Math.min(1, Math.max(0, (Date.now() - departsAt) / (arrivesAt - departsAt)))
}
