import { A, Is, each } from 'garage/util'

export function $() {
    let query, fx, el = document

    if (arguments[ 0 ]?.raw) {
        query = String.raw(...arguments)
    }
    else {
        for (let a of arguments) {
            switch (typeof a) {
                case 'function': fx = a; break
                case 'object':   el = a; break
                case 'string': query ? fx ??= x => x[ a ] : query = a; break
                default:               fx ??= x => x[ a ]; break
            }
        }
    }
    query = query.replace(/^ *\++ */, _ => (fx ??= x => x, ''))
    return fx
        ? A.from(el.querySelectorAll(query), fx)
        : el.querySelector(query)
}

$.of = node
export function node(tag, attr, ...children) {
    const el = document.createElement(tag)
    /**/ if (Is(Node, attr)) el.append(attr)
    else if (Is.o(attr)) each(attr, el.setAttribute, el)
    else if (Is(attr)) el.textContent = attr

    children.length && el.append(...children)
    return el
}

/** @type { typeof String.raw } */
export function raw(s, ...a) {
    return (a => s?.raw
        ? String.raw(s, ...a)
        : ''.concat(s, ...a))(a.map(esc))
}

export function esc(s) {
    return Is.a(s)
        ? s.map(esc).join('')
        : String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            '\'': '&#39;',
        }[ c ]))
}

export function cr(n) {
    return '₢' + Number(n).toFixed(2)
}

export function fmtYears(n) {
    return Number(n).toFixed(1)
}

/*  a route inside one system is far shorter than a light year.
    "0.0000052ly" tells the player nothing, so show AU there. */
export function fmtDist(ly) {
    return ly < 0.01
        ? `${ (ly * 63241.077).toFixed(2) }AU`
        : `${ ly }ly`
}

/*
    bind tag names to `node`, gaining:
        $.img({ src, alt, ... })
        $.input({ type, value, ... })
*/
for (const tag of `
    br          hr
    script      link  style
    nav         ol ul li dl dt dd
    dialog      details summary
    div         main header aside footer article section
    table       thead tbody tfoot caption th tr td col colgroup
    img         svg canvas picture figure figcaption audio video
    hgroup      h1 h2 h3 h4 h5 h6
    blockquote  p i b u s q
                em span pre code
                time address cite
                del dfn ins kbd mark samp abbr acronym
                sub sup big small strong strike
    form        input select option optgroup data datalist
                output label legend fieldset textarea progress meter
    a           button
    `.match(/\w+/g)) $[ tag ] = node.bind($, tag)

$.block = $.blockquote
$.field = $.fieldset

$.btn = $.button
$.txa = $.textarea

$.out = $.output
$.inp = $.input
$.inp.txt = attr => $.inp({ type: 'text', ...attr })
$.inp.url = attr => $.inp({ type: 'url', ...attr })
$.inp.num = attr => $.inp({ type: 'number', ...attr })
$.inp.box = attr => $.inp({ type: 'checkbox', ...attr })
$.inp.radio = attr => $.inp({ type: 'radio', ...attr })
$.inp.search = attr => $.inp({ type: 'search', ...attr })
$.inp.color = attr => $.inp({ type: 'color', ...attr })
$.inp.file = attr => $.inp({ type: 'file', ...attr })
$.inp.date = attr => $.inp({ type: 'date', ...attr })
$.inp.time = attr => $.inp({ type: 'time', ...attr })
$.inp.mail = attr => $.inp({ type: 'email', ...attr })
$.inp.pass = attr => $.inp({ type: 'password', ...attr })
$.inp.range = attr => $.inp({ type: 'range', ...attr })

$.sel = $.select
$.opt = $.option
$.opt.group = $.optgroup

$.pic = $.picture
$.fig = $.figure
$.fig.cap = $.figcaption

$.t = $.table
$.t.head = $.thead
$.t.body = $.tbody
$.t.foot = $.tfoot
