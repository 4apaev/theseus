import Http from 'node:http'

/*  raw upgrade client for testing anything wired to `server.on('upgrade')`
    - a real websocket handshake, no ws library. `path` is appended to '/'
    (pass a full query string like '?token=...' or a path like '/foo').
    resolves { rs, socket } on 101, { rs } (no socket) on a plain http
    refusal (400/401/...). the caller owns the socket - write frames, read
    with `socket.on('data', ...)`, remember to `socket.destroy()` when done */
export function wsConnect(port, path = '', headers = {}) {
    return new Promise((resolve, reject) => {
        const rq = Http.request({
            port,
            path: `/${ path }`,
            headers: {
                connection         : 'Upgrade',
                upgrade            : 'websocket',
                'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
                ...headers,
            },
        })
        rq.on('upgrade', (rs, socket) => {
            socket.on('error', () => {})
            resolve({ rs, socket })
        })
        rq.on('response', rs => resolve({ rs }))
        rq.on('error', reject)
        rq.end()
    })
}
