import Sync from 'garage/sync'

import { $ } from './dom.js'
import { state } from './state.js'
import { feedLine } from './feed.js'
import { showAuth, logout } from './api.js'
import { register, login, enterGame } from './session.js'
import { travel, buy, sell } from './commands.js'
import { tickEta, updateHint } from './render.js'

Sync.base = location.origin
Sync.head.set('content-type', 'application/json')

// ── wiring + boot ─────────────────────────────────────────────────────────

$('#registerBtn').addEventListener('click', register)
$('#loginBtn').addEventListener('click', login)
$('#logoutBtn').addEventListener('click', () => logout())
$('#buyBtn').addEventListener('click', buy)
$('#sellBtn').addEventListener('click', sell)
$('#tradeGood').addEventListener('change', updateHint)
$('#password').addEventListener('keydown', e => e.key === 'Enter' && login())

$('#travelBody').addEventListener('click', e => {
    const g = e.target.closest('[data-stid]')
    g?.classList.contains('reachable') && travel(g.dataset.stid)
})

// TODO: this is never ends, should stop on arrival, start on departure
setInterval(tickEta, 250)

feedLine('dim', 'terminal ready')
state.token ? enterGame() : showAuth()
