import { Is, each } from 'garage/util'

export default function dump(it, tab = 4) {

    Is.n(tab) && (tab = ' '.repeat(tab))

    const seen = new WeakMap

    function inner(prev, next, path, key) {
        const prfx = tab.repeat(path.length)

        if (Is.x(next)) {
            if (seen.has(next)) {
                prev.push(`${ prfx }<Circular:${ key } = ${ seen.get(next) }>`)
            }
            else {
                seen.set(next, path.join('.'))
                prev.push(prfx + key),
                each(next, Is(next, Array, Set)
                    ? (k, v) => inner(prev, v, path.concat(k), '- ')
                    : (k, v) => inner(prev, v, path.concat(k), k + ': '))
            }

        }
        else {
            prev.push(prfx + key + next)
        }
    }
    console.info(inner([], it, [], '').join('\n'))
}
