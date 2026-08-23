/* eslint-disable camelcase */
import { state } from './state.js'
import { drawnShips, dockedAt } from './traffic.js'
import {
    $,
    cr,
    esc,
    fmtYears,
} from './dom.js'

// gate on the universe, not on our ship. a player with no ship must
// still see the map, and the other ships on it.
export function renderTravel() {
    const body = $('#travelBody')
    if (!state.universe) return body.innerHTML = '<p class="dim">—</p>'

    const pos   = stationLayout()
    const edges = uniqueEdges(state.universe.routes)

    body.innerHTML = `
        <svg viewBox="0 0 320 240" class="map">
            <g class="mapRoutes">${ routeLines(edges, pos) }</g>
            <g class="mapStations">${ mapStations(pos, state.ship) }</g>
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

    const pos  = stationLayout()
    const ships = new Map(drawnShips().map(s => [ s.sid, s ]))

    for (const dot of $('+.shipMarker')) {
        const s = ships.get(dot.dataset.sid)
        if (s?.status !== 'transit') continue

        const p = shipPos(pos, s)
        dot.setAttribute('cx', p.x)
        dot.setAttribute('cy', p.y)
    }
}

let layoutUniverse, layoutCache

// state.universe is set once and never mutated - cache the layout against
// the reference itself so the 250ms transit tick doesn't redo the trig
function stationLayout() {
    if (layoutUniverse !== state.universe) {
        layoutUniverse = state.universe
        layoutCache    = layoutStations(state.universe.stations)
    }
    return layoutCache
}

function layoutStations(stations) {
    const cx = 160, cy = 120, r = 90
    return new Map(stations.map((st, i) => {
        const a = 2
            * Math.PI
            * i
            / stations.length
            - Math.PI
            / 2
        return [ st.stid, {
            x: cx + r * Math.cos(a),
            y: cy + r * Math.sin(a),
        }]
    }))
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

function routeLines(edges, pos) {
    return edges.map(r => {
        const a = pos.get(r.from)
        const b = pos.get(r.to)
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        return `
        <line
            class=mapRoute
            x1="${ a.x }" x2="${ b.x }"
            y1="${ a.y }" y2="${ b.y }"
        />
        <text class="mapLy" x="${ mx }" y="${ my }">
            ${ r.ly }ly
        </text>`
    }).join('')
}

function routeInfo(route, ship) {
    const { time_scale, interest_rate } = state.universe.constants
    const v = ship.velocity

    const abs  = route.ly / v
    const rel  = abs * Math.sqrt(1 - v * v)
    const secs = Math.round(abs * time_scale)
    const cost = Number(state.me?.balance ?? 0) * (Math.pow(1 + interest_rate, abs) - 1)

    return `${
        route.ly      }ly · eta ${
        fmtYears(abs) }yr (~${
        secs          }s) · you'd age ${
        fmtYears(rel) }yr · ${
        cr(cost)      } time-cost`
}

// ship is undefined until the first ship exists - stay safe on every use
function mapStations(pos, ship) {
    const docked = ship?.status === 'docked'

    return state.universe.stations.map(port => {
        const { x, y } = pos.get(port.stid)
        const route = docked && state.universe.routes.find(route =>
            route.from === ship.stid && route.to === port.stid)

        const crew = dockedAt(port.stid)
        const cls  = [
            'mapStation',
            port.stid === ship?.stid && 'here',
            route && 'reachable',
            crew.length && 'busy',
        ].filter(Boolean).join(' ')

        const title = [
            route
                ? `${ esc(port.name) } · ${ esc(routeInfo(route, ship)) }`
                : esc(port.name),
            crew.length && `in port: ${ esc(crew.map(t => t.handle ?? '—').join(' · ')) }`,
        ].filter(Boolean).join('\n')

        return `<g
        class="${ cls }"
        data-stid="${ esc(port.stid) }">
        <circle r="7" cx="${ x }" cy="${ y }" />
        <text class="mapLabel" x="${ x }" y="${ y + 20 }">${ esc(port.name) }</text>
        <title>${ title }</title>
    </g>`
    }).join('')
}

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
