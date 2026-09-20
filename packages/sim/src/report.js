import Fs from 'node:fs/promises'
import Pt from 'node:path'

import { DB } from '@theseus/db'
import { readEnv } from '@theseus/config'

import { check, failed } from './invariants.js'
import { dbStats, gameStats } from './analytics.js'

/*
    turns one sim run into data: a json file for diffing runs, and a
    self-contained html page with the charts. chart.js loads from a
    cdn, so the page needs the network the first time it opens.
*/

export function percentile(list, p) {
    if (!list.length) return 0
    const sorted = [ ...list ].sort((a, b) => a - b)
    return +sorted[ Math.min(sorted.length - 1, Math.floor(sorted.length * p)) ].toFixed(1)
}

function group(rows, key, value) {
    const out = new Map
    for (const r of rows) {
        const k = key(r)
        out.has(k) || out.set(k, [])
        out.get(k).push(value(r))
    }
    return out
}

/** one row per method+path: how many, how slow, how many failed */
export function httpTable(http) {
    const by = group(http, r => `${ r.method } ${ r.path }`, r => r)
    return [ ...by ].map(([ route, rows ]) => {
        const ms = rows.map(r => r.ms)
        return {
            route,
            calls : rows.length,
            p50   : percentile(ms, 0.5),
            p95   : percentile(ms, 0.95),
            max   : +Math.max(...ms).toFixed(1),
            failed: rows.filter(r => r.status >= 400).length,
        }
    }).sort((a, b) => b.calls - a.calls)
}

/** command → event, the wait a player actually feels */
export function latencyTable(latency) {
    const by = group(latency, r => r.action, r => r.ms)
    return [ ...by ].map(([ action, ms ]) => ({
        action,
        answered: ms.length,
        p50     : percentile(ms, 0.5),
        p95     : percentile(ms, 0.95),
        max     : +Math.max(...ms).toFixed(1),
    })).sort((a, b) => b.answered - a.answered)
}

export function errorTable(errors) {
    const by = group(errors, e => `${ e.status } ${ e.where } ${ e.message }`, e => e)
    return [ ...by ].map(([ key, rows ]) => ({ key, count: rows.length }))
        .sort((a, b) => b.count - a.count)
}
function summary(data) {
    const { http, latency, events } = data
    const all = http.map(r => r.ms)
    return {
        requests  : http.length,
        failed    : http.filter(r => r.status >= 400).length,
        req_p95   : percentile(all, 0.95),
        answered  : latency.length,
        reply_p95 : percentile(latency.map(r => r.ms), 0.95),
        events    : events.reduce((n, e) => n + e.count, 0),
        event_kinds: events.length,
    }
}

export async function report(stats, opt) {
    const pool  = DB.create({ schema: 'projection' })
    const since = new Date(opt.stamp).toISOString()

    try {
        const starter = readEnv('STARTER_CREDITS', 1000)
        const { events, tables, rejects } = await dbStats(pool, since)
        const game = await gameStats(pool, since, starter)
        const invariants = await check(pool, since, starter)
        const data = {
            run: {
                seed: opt.seed, players: opt.players, minutes: opt.minutes,
                ticks: opt.ticks, started: since,
            },
            clock: opt.clock,
            summary : summary({ http: stats.http, latency: stats.latency, events }),
            invariants,
            asked   : stats.asked,
            answered: stats.answered,
            timeouts: stats.timeouts,
            events,
            rejects,
            tables,
            game,
            routes  : httpTable(stats.http),
            replies : latencyTable(stats.latency),
            errors  : errorTable(stats.errors),
            http    : stats.http,
            latency : stats.latency,
        }

        await Fs.mkdir(opt.out, { recursive: true })
        const json = Pt.join(opt.out, `sim-${ opt.seed }.json`)
        const html = Pt.join(opt.out, `sim-${ opt.seed }.html`)

        await Fs.writeFile(json, JSON.stringify(data, null, 2))
        await Fs.writeFile(html, page(data))
        stdout(data)
        return { json, html, data, broken: failed(invariants) }
    }
    finally {
        await pool.end()
    }
}

function table(title, rows, cols) {
    if (!rows.length) return
    console.log('\n── %s', title)
    console.table(rows.map(r => Object.fromEntries(cols.map(c => [ c, r[ c ] ]))))
}

/** the head and the tail of a sorted list - least tells as much as most */
export function ends(rows, n = 3) {
    return rows.length <= n * 2
        ? rows
        : [ ...rows.slice(0, n), ...rows.slice(-n) ]
}

function invariantRows(list) {
    return list.map(r => ({
        invariant: r.name,
        result   : r.ok ? 'pass' : r.hard ? 'FAIL' : 'known gap',
        broke    : r.broke < 0 ? 'query error' : r.broke,
    }))
}

function stdout(d) {
    console.log('\n══ sim %d ══ %d players, %d min, %d ticks',
        d.run.seed, d.run.players, d.run.minutes, d.run.ticks)
    console.table([ d.summary ])

    /*  drift runs on the wall clock, travel runs on TIME_SCALE. only
        drift_per_year holds the 2 together, so a run compares to
        another run at the same number, and to no other  */
    console.table([ d.clock ])

    table('requests', d.routes, [ 'route', 'calls', 'p50', 'p95', 'max', 'failed' ])
    table('command → event', d.replies, [ 'action', 'answered', 'p50', 'p95', 'max' ])
    table('events in the log', d.events, [ 'etype', 'count', 'lag_ms' ])
    table('why the game said no', d.rejects, [ 'etype', 'reason', 'count' ])
    table('rows', d.tables, [ 'schema', 'table', 'rows' ])
    table('errors', d.errors.slice(0, 15), [ 'key', 'count' ])

    const g = d.game
    table('most visited stations', g.visits, [ 'stid', 'visits' ])
    table('the travel clock', ends(g.clock), [ 'handle', 'ship', 'transit_s', 'docked_s' ])
    table('busiest traders', ends(g.traders), [ 'handle', 'trades', 'buys', 'sells', 'units' ])
    table('wallets', ends(g.wallets), [ 'handle', 'balance', 'profit' ])
    table('goods', g.goods, [ 'gid', 'units', 'trades', 'player_profit' ])
    table('stations', g.stations, [ 'stid', 'trades', 'station_profit' ])
    table('time dilation', ends(g.relativity), [ 'handle', 'galaxy_years', 'ship_years', 'saved' ])

    table('invariants', invariantRows(d.invariants), [ 'invariant', 'result', 'broke' ])

    for (const r of d.invariants.filter(x => !x.ok)) {
        console.log('\n%s %s - %s', r.hard ? '✖' : '⚠', r.name, r.note)
        r.error ? console.log('   ', r.error) : console.table(r.rows)
    }

    d.timeouts && console.log('\n⚠ %d commands never got an event', d.timeouts)
}

const CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js'

function page(d) {
    return `<!doctype html>
<meta charset=utf-8>
<title>sim ${ d.run.seed }</title>
<style>
  :root {
    color-scheme: dark;
    --surface:#0e140e; --page:#0b0f0b; --line:#1e3a1e; --grid:#1f2c1f;
    --ink:#dce6dc; --ink2:#93a693; --accent:#6abf6a;

    /* categorical slots, fixed order, validated against --surface */
    --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500;
    --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767;

    /* polarity: blue and red poles, gray midpoint */
    --pos:#3987e5; --neg:#e66767; --mid:#383835;
  }
  body { background:var(--page); color:var(--ink); font:14px/1.5 ui-monospace, Menlo, monospace; margin:0; padding:24px }
  h1 { font-size:16px; letter-spacing:.2em; font-weight:400; color:var(--accent) }
  h2 { font-size:12px; letter-spacing:.2em; color:var(--accent); margin:32px 0 8px }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:24px }
  .card { border:1px solid var(--line); border-radius:6px; padding:16px; background:var(--surface) }
  .kpi  { color:var(--ink2); font-size:11px; letter-spacing:.1em }
  .kpi + div { font-size:22px; color:var(--ink) }
  table { border-collapse:collapse; width:100% }
  th, td { text-align:left; padding:4px 8px; border-bottom:1px solid var(--grid); font-size:12px }
  th { color:var(--ink2); font-weight:400 }
  td.n { text-align:right; font-variant-numeric:tabular-nums }
</style>
<h1>SIM ${ d.run.seed } · ${ d.run.players } players · ${ d.run.minutes } min · ${ d.run.ticks } ticks</h1>
<div class=card style="margin-bottom:24px">
  <span class=kpi>tempo</span>
  time_scale ${ d.clock.time_scale } ·
  drift every ${ d.clock.drift_interval } ms ·
  <strong>${ d.clock.drift_per_year } drift steps per game year</strong> ·
  interest ${ d.clock.interest_rate }
  <div class=kpi style="margin-top:8px">compare a run only against another run with the same drift steps per game year</div>
</div>
${ cards(d.summary) }
<h2>what the game answered</h2>
<div class=grid>
  <div class=card><canvas id=chart_events></canvas></div>
  <div class=card><canvas id=chart_ask></canvas></div>
</div>
<h2>time</h2>
<div class=grid>
  <div class=card><canvas id=chart_reply></canvas></div>
  <div class=card><canvas id=chart_req></canvas></div>
</div>
<h2>the game</h2>
<div class=grid>
  <div class=card><canvas id=chart_visits></canvas></div>
  <div class=card><canvas id=chart_clock></canvas></div>
  <div class=card><canvas id=chart_goods></canvas></div>
  <div class=card><canvas id=chart_goods_money></canvas></div>
  <div class=card><canvas id=chart_money></canvas></div>
  <div class=card><canvas id=chart_stations></canvas></div>
</div>
<div class=grid>
  ${ htmlTable(d.game.visits, [ 'stid', 'visits' ]) }
  ${ htmlTable(d.game.goods, [ 'gid', 'units', 'trades', 'player_profit' ]) }
  ${ htmlTable(d.game.stations, [ 'stid', 'trades', 'station_profit' ]) }
  ${ htmlTable(d.game.traders, [ 'handle', 'trades', 'buys', 'sells', 'units' ]) }
  ${ htmlTable(d.game.wallets, [ 'handle', 'balance', 'profit' ]) }
  ${ htmlTable(d.game.clock, [ 'handle', 'ship', 'transit_s', 'docked_s' ]) }
  ${ htmlTable(d.game.relativity, [ 'handle', 'galaxy_years', 'ship_years', 'saved' ]) }
</div>
<h2>invariants</h2>
${ htmlTable(d.invariants.map(r => ({
        invariant: r.name,
        result   : r.ok ? 'pass' : r.hard ? 'FAIL' : 'known gap',
        broke    : r.broke < 0 ? 'query error' : r.broke,
        note     : r.note,
    })), [ 'invariant', 'result', 'broke', 'note' ]) }
<h2>why the game said no</h2>
<div class=grid>
  <div class=card><canvas id=chart_rejects></canvas></div>
  ${ htmlTable(d.rejects, [ 'etype', 'reason', 'count' ]) }
</div>
<h2>tables</h2>
${ htmlTable(d.events, [ 'etype', 'count', 'lag_ms' ]) }
${ htmlTable(d.routes, [ 'route', 'calls', 'p50', 'p95', 'max', 'failed' ]) }
${ htmlTable(d.tables, [ 'schema', 'table', 'rows' ]) }
${ d.errors.length ? '<h2>errors</h2>' + htmlTable(d.errors, [ 'key', 'count' ]) : '' }
<script src="${ CDN }"></script>
<script>
const DATA = ${ JSON.stringify({
        events  : d.events,
        asked   : d.asked,
        answered: d.answered,
        replies : d.replies,
        routes  : d.routes.slice(0, 12),
        rejects : d.rejects.slice(0, 10),
        game    : {
            visits  : d.game.visits,
            goods   : d.game.goods,
            stations: d.game.stations,
            clock   : d.game.clock.slice(0, 12),
            wallets : d.game.wallets.slice(0, 12),
        },
    }) }

const css   = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim()
const SLOT  = [ '--s1','--s2','--s3','--s4','--s5','--s6','--s7','--s8' ].map(css)
const INK   = css('--ink')
const INK2  = css('--ink2')
const GRID  = css('--grid')
const FACE  = css('--surface')
const POS   = css('--pos')
const NEG   = css('--neg')

const font = { family:'ui-monospace, Menlo, monospace', size:10 }
const axis = { ticks:{ color:INK2, font }, grid:{ color:GRID }, border:{ color:GRID }}

// a legend belongs to 2 series or more. one series wears its title instead
const base = (title, legend) => ({
  plugins:{
    legend:{ display: legend, labels:{ color:INK, font, boxWidth:10, boxHeight:10 }},
    title :{ display:true, text:title, color:INK2, font:{ ...font, size:11 }},
    tooltip:{ backgroundColor:FACE, borderColor:GRID, borderWidth:1, titleColor:INK, bodyColor:INK, titleFont:font, bodyFont:font },
  },
  scales:{ x:axis, y:axis },
})

const bar = { borderRadius:4, borderSkipped:false, borderColor:FACE, borderWidth:2 }

/*  a doughnut reads about 7 slices. the rest fold into one - the whole
    list stays in the table under the chart  */
function fold(rows, key, val, keep = 7) {
  const top  = rows.slice(0, keep)
  const rest = rows.slice(keep).reduce((n, r) => n + Number(val(r)), 0)
  const out  = top.map(r => ({ label: key(r), value: Number(val(r)) }))
  return rest ? [ ...out, { label: 'other · ' + (rows.length - keep), value: rest }] : out
}

const events = fold(DATA.events, e => e.etype.replace('.v1', ''), e => e.count)

new Chart(chart_events, { type:'doughnut', data:{
  labels: events.map(e => e.label),
  datasets:[{ data: events.map(e => e.value), backgroundColor: SLOT, borderColor:FACE, borderWidth:2 }]},
  options:{ ...base('events in the log', true), scales:{}, plugins:{ ...base('events in the log', true).plugins,
    legend:{ position:'right', labels:{ color:INK, font, boxWidth:10, boxHeight:10 }}}}})

new Chart(chart_ask, { type:'bar', data:{
  labels: Object.keys(DATA.asked),
  datasets:[
    { label:'asked',    data: Object.values(DATA.asked), backgroundColor:SLOT[0], ...bar },
    { label:'answered', data: Object.keys(DATA.asked).map(a => (DATA.replies.find(r => r.action === a)||{}).answered || 0), backgroundColor:SLOT[1], ...bar },
  ]}, options: base('what the sim asked, what the game answered', true) })

new Chart(chart_reply, { type:'bar', data:{
  labels: DATA.replies.map(r => r.action),
  datasets:[
    { label:'p50 ms', data: DATA.replies.map(r => r.p50), backgroundColor:SLOT[0], ...bar },
    { label:'p95 ms', data: DATA.replies.map(r => r.p95), backgroundColor:SLOT[1], ...bar },
  ]}, options: base('command → event, ms', true) })

new Chart(chart_req, { type:'bar', indexAxis:'y', data:{
  labels: DATA.routes.map(r => r.route),
  datasets:[{ label:'p95 ms', data: DATA.routes.map(r => r.p95), backgroundColor:SLOT[0], ...bar }]},
  options: base('request p95, ms', false) })

DATA.rejects.length && new Chart(chart_rejects, { type:'bar', indexAxis:'y', data:{
  labels: DATA.rejects.map(r => r.reason),
  datasets:[{ label:'count', data: DATA.rejects.map(r => r.count), backgroundColor:SLOT[1], ...bar }]},
  options: base('why the game said no', false) })

const G = DATA.game

G.visits.length && new Chart(chart_visits, { type:'bar', indexAxis:'y', data:{
  labels: G.visits.map(r => r.stid),
  datasets:[{ label:'arrivals', data: G.visits.map(r => r.visits), backgroundColor:SLOT[2], ...bar }]},
  options: base('most visited stations', false) })

G.clock.length && new Chart(chart_clock, { type:'bar', data:{
  labels: G.clock.map(r => r.handle),
  datasets:[
    { label:'in transit s', data: G.clock.map(r => +r.transit_s), backgroundColor:SLOT[0], stack:'t', ...bar },
    { label:'docked s',     data: G.clock.map(r => +r.docked_s),  backgroundColor:SLOT[2], stack:'t', ...bar },
  ]}, options:{ ...base('where the time went', true),
    scales:{ x:{ ...axis, stacked:true }, y:{ ...axis, stacked:true }}}})

/*  units and credits do not share a scale, so they do not share an axis  */
G.goods.length && new Chart(chart_goods, { type:'bar', data:{
  labels: G.goods.map(r => r.gid),
  datasets:[{ label:'units', data: G.goods.map(r => r.units), backgroundColor:SLOT[3], ...bar }]},
  options: base('units traded', false) })

G.goods.length && new Chart(chart_goods_money, { type:'bar', data:{
  labels: G.goods.map(r => r.gid),
  datasets:[{ label:'player profit',
    data: G.goods.map(r => +r.player_profit),
    backgroundColor: G.goods.map(r => +r.player_profit < 0 ? NEG : POS), ...bar }]},
  options: base('profit per good, credits', false) })

G.wallets.length && new Chart(chart_money, { type:'bar', data:{
  labels: G.wallets.map(r => r.handle),
  datasets:[{ label:'profit',
    data: G.wallets.map(r => +r.profit),
    backgroundColor: G.wallets.map(r => +r.profit < 0 ? NEG : POS), ...bar }]},
  options: base('profit per player, credits', false) })

G.stations.length && new Chart(chart_stations, { type:'bar', indexAxis:'y', data:{
  labels: G.stations.map(r => r.stid),
  datasets:[{ label:'station profit',
    data: G.stations.map(r => +r.station_profit),
    backgroundColor: G.stations.map(r => +r.station_profit < 0 ? NEG : POS), ...bar }]},
  options: base('profit per station, credits', false) })
</script>`
}

function cards(s) {
    return '<div class=grid>' + Object.entries(s).map(([ k, v ]) =>
        `<div class=card><div class=kpi>${ k }</div><div>${ v }</div></div>`,
    ).join('') + '</div>'
}

function htmlTable(rows, cols) {
    if (!rows.length) return ''
    const head = cols.map(c => `<th>${ c }`).join('')
    const body = rows.map(r => '<tr>' + cols.map(c =>
        `<td class="${ typeof r[ c ] === 'number' ? 'n' : '' }">${ r[ c ] ?? '' }`).join('')).join('')
    return `<div class=card><table><tr>${ head }</tr>${ body }</table></div>`
}
