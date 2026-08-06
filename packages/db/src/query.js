import { Is, each } from '@theseus/util'

export async function withClient(pool, fx) {
    const client = await pool.connect()
    try { /*
        in an async function, finally fires synchronously
        after return, before the returned promise resolves.
        client.release() fires while fx is still running.
        tus, needs await.
     */ return await fx(client, Query(client))
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
