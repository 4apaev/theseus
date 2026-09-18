import { Fail } from '@theseus/util'

/**
 * reads the bearer token and puts
 * the claims on the request.
 *
 * @param {Auth} jwt
 * @return {MWare}
 */
export function auth(jwt) {
    return (rq, rs, next) => {
        const [ scheme, token ] = rq.get('authorization').split(/ +/)

        scheme == 'Bearer' && token || Fail.raise(401, 'missing bearer token')
        rq.claims = jwt.verify(token)
        return next()
    }
}

/**
 * @param {string} role
 * @return {MWare}
 */
export function requireRole(role) {
    return (rq, rs, next) => {
        rq.claims.role === role || Fail.raise(403, 'forbidden')
        return next()
    }
}

/**
 * @typedef { import('garage').MWare } MWare
 * @typedef { import('@theseus/auth').Auth } Auth
 */
