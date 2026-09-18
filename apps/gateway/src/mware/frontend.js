import Pt from 'node:path'
import { O } from '@theseus/util'

const dict = O.ƒ({
    constants : '/constants.js',
    mime      : '/mime.js',
    sync      : '/sync.js',
    use       : '/use.js',
    util      : '/util.js',
})

/**
 * serves files from one directory.
 * dict renames a request to another
 * file in the same directory.
 * a path outside base answers 404.
 *
 * @param {string} base
 * @return {import('garage').MWare}
 */
export function frontend(base) {
    return (rq, rs) => {
        const path = Pt.join(base, dict[ rq.params.file ] ?? rq.params.file)
        return path.startsWith(base + Pt.sep)
            ? rs.file(path)
            : rs.send(404, 'not found')
    }
}
