export function fakeClient(overrides = {}) {
    const log = []
    return {
        log,
        release() {},
        async query(sql, params) {
            log.push({
                sql: sql.trim(),
                params,
            })

            for (const [ match, fx ] of Object.entries(overrides))
                if (sql.includes(match)) return fx(params)
            return { rows: []}
        },
    }
}

export function fakePool(overrides = {}) {
    const client = fakeClient(overrides)
    return {
        client,
        query  : client.query,
        connect: () => Promise.resolve(client),
    }
}

export function fakeTransact(client) {
    return (pool, fn) => fn(client)
}

export function outboxEvents(client) {
    return client.log
        .filter(({ sql }) => sql.includes('insert into outbox'))
        .map(({ params }) => JSON.parse(params[ 3 ]))
}

export function makeCmd(payload, extra = {}) {
    return {
        cmd           : 'cmd-test',
        correlation_id: 'corr-test',
        payload,
        ...extra,
    }
}
