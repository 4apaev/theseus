import { $ } from './dom.js'

export function feedLine(kind, text) {
    const t = (new Date).toTimeString().slice(0, 8)

    const el = $.of('div', { class: 'ln ' + kind }, `[${ t }] ${ text }`)
    const feed = $('#feed')
    const top = feed.scrollTop <= 4 // reading the newest, not scrolled into history

    feed.prepend(el)
    while (feed.children.length > 200)
        feed.removeChild(feed.lastChild)

    if (top)
        feed.scrollTop = 0

    return el
}

export function mark(el, ok) {
    el.textContent = el.textContent.replace('…', ok ? '✓' : '✗')
    el.classList.remove('cmd')
    el.classList.add(ok ? 'ok' : 'err')
}
