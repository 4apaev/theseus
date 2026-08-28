import { Is, each } from '@theseus/util'

export async function withClient(pool, fx) {
    const client = await pool.connect()
    try { /*
        in an async function, finally fires synchronously
        after return, before the returned promise resolves.
        client.release() fires while fx is still running.
        tus, needs await.
     */ return await fx(
            client,
            client.sql = Query(client),
            client.insert = (t, d) => insert(client, t, d),
            client.where = (...a) => client.query(...selectWhere(...a)),
        )
    }
    finally {
        client.release()
    }
}

export function Query(pool) {
    return ({ raw }, ...subs) => {
        const sql = []
        const vals = []
        const seen = new Map

        for (let x, i = 0; i < raw.length; i++) {
            sql.push(raw[ i ])

            if (i >= subs.length)
                continue

            seen.has(x = subs[ i ])
            || seen.set(x, vals.push(x))

            sql.push(`$${ seen.get(x) }`)
        }
        return pool.query(sql.join(''), vals)
    }
}

export function insert(client, table, data) {
    const ks = []
    const ixs = []
    const vls = []

    each(data, (k, v, i) => {
        ks.push(k)
        vls.push(v ?? null)
        ixs.push('$'.concat(1 + i))
    })

    const sql = `INSERT INTO ${ table } (${ ks }) VALUES (${ ixs })`
    return client.query(sql, vls)
}

export function where(table, query) {
    Is.o(table)
        ? (query = table, table = '')
        : table += '.'

    let sql = '', vls  = []
    each(query, (k, v, i) => {
        vls.push(v)
        sql += `
    ${ i
        ? 'and'
        : 'where' } ${ table }${ k } = $${ i + 1 }`
    })
    return [ sql, vls ]
}

export function selectWhere(table, query, ...keys) {
    keys.length || keys.push('*')
    const [ sql, vls ] = where(table, query)
    return [
        `select ${ keys.join(', ') } from ${ table } ${ sql }`,
        vls,
    ]
}
