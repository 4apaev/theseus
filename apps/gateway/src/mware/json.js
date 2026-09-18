import { Is, Fail } from '@theseus/util'

const BODY_LIMIT = 0x10000

/**
 * @description
 *     reads the body, and refuses anything that is not a json object.
 *
 * @type { import('garage').MWare }
 */
export async function json(rq, rs, next) {
    rq.size > BODY_LIMIT && Fail.raise(413, 'body too large')

    await rq.reader()
    if (rq.error)
        throw rq.error

    Is.o(rq.body) || Fail.raise(400, 'invalid json body')
    return next()
}
