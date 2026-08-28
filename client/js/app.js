import Sync from 'garage/sync'

import { $ } from './dom.js'
import { state } from './state.js'
import { feedLine } from './feed.js'
import { showAuth, logout } from './api.js'
import { register, login, enterGame } from './session.js'
import { confirmTravel, confirmTrade } from './commands.js'
import { tickEta, openTravelDialog, openTradeDialog, updateTradeTotal, openNameDialog, confirmName } from './render.js'

Sync.base = location.origin
Sync.head.set('content-type', 'application/json'); state.token &&
Sync.head.set('authorization', 'Bearer ' + state.token)

// ── wiring + boot ─────────────────────────────────────────────────────────

$('#registerBtn').addEventListener('click', register)
$('#loginBtn').addEventListener('click', login)
$('#logoutBtn').addEventListener('click', () => logout())
$('#password').addEventListener('keydown', e => e.key === 'Enter' && login())

$('#travelBody').addEventListener('click', e => {
    const g = e.target.closest('[data-stid]')
    g?.classList.contains('reachable') && openTravelDialog(g.dataset.stid)
})

$('#game').addEventListener('click', e => {
    const btn = e.target.closest('.tradeBtn')
    btn && openTradeDialog(btn.dataset.side, btn.dataset.gid)

    e.target.closest('#renameBtn') && openNameDialog()
})

$('#nameConfirmBtn').addEventListener('click', confirmName)
$('#nameCancelBtn').addEventListener('click', () => $('#nameDialog').close())
$('#nameInput').addEventListener('keydown', e => e.key === 'Enter' && confirmName())

$('#tradeQty').addEventListener('input', updateTradeTotal)
$('#tradeConfirmBtn').addEventListener('click', confirmTrade)
$('#tradeCancelBtn').addEventListener('click', () => $('#tradeDialog').close())

$.id('travelConfirmBtn').addEventListener('click', confirmTravel)
$.id('travelCancelBtn').addEventListener('click', () => $.id('travelDialog').close())

// TODO: this is never ends, should stop on arrival, start on departure
setInterval(tickEta, 250)

feedLine('dim', 'terminal ready')
state.token ? enterGame() : showAuth()
