import { $ } from './dom.js'

export function feedLine(kind, text) {
    const t = (new Date).toTimeString().slice(0, 8)

    const el = $.of('div', { class: 'ln ' + kind }, `[${ t }] ${ text }`)
    const feed = $('#feed')
    const down = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 4

    feed.appendChild(el)
    while (feed.children.length > 200)
        feed.removeChild(feed.firstChild)

    if (down)
        feed.scrollTop = feed.scrollHeight

    return el
}

export function mark(el, ok) {
    el.textContent = el.textContent.replace('…', ok ? '✓' : '✗')
    el.classList.remove('cmd')
    el.classList.add(ok ? 'ok' : 'err')
}
