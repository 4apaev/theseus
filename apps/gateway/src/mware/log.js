/**
 * one line per request:
 *     time in ms, status, method, url
 *
 * @type {import('garage').MWare}
 */
export async function log(rq, rs, next) {
    const start = performance.now()

    await next()
    console.log(
        (performance.now() - start).toFixed(1).padEnd(4),
        rs.status,
        rq.method,
        rq.url,
    )
}
