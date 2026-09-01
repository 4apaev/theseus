// row-level helpers, shared by every saga in handlers.js. each takes the
// live transaction client - a lock or a mutation must run on the same
// connection as the commit or reject that follows it. login and the
// admin promote run outside a transaction, so they take the pool instead.

export async function findPlayerByHandle(client, handle) {
    const { rows: [ row ] } = await client.query(`
        SELECT pid, handle, hash, role
          FROM players
         WHERE handle = $1
        `, [ handle ],
    )
    return row
}

export function promoteToAdmin(client, pid) {
    return client.query(`
        UPDATE players
           SET role = $1
         WHERE pid = $2
    `, [ 'admin', pid ])
}

export function insertPlayer(client, pid, handle, hash) {
    return client.query(`
        INSERT INTO players (pid, handle, hash)
        VALUES ($1, $2, $3)
    `, [ pid, handle, hash ])
}

export function insertWallet(client, pid, balance) {
    return client.query(`
        INSERT INTO wallets (pid, balance)
        VALUES ($1, $2)
    `, [ pid, balance ])
}

export async function lockWallet(client, pid) {
    const { rows: [ row ] } = await client.query(`
        SELECT balance, version
          FROM wallets
         WHERE pid = $1
        FOR UPDATE
    `, [ pid ],
    )
    return row
}

export async function claimRfid(client, { pid, rfid, amount }, type) {
    const { rows } = await client.query(`
        INSERT INTO wallet_transactions (rfid, pid, amount, type)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
        RETURNING rfid
    `, [ rfid, pid, amount, type ])
    return rows.length > 0
}

export async function updateWallet(opr, client, pid, amount) {
    const rs = await client.query(`
        UPDATE wallets
           SET balance = balance ${ opr } $2,
               version = version + 1
         WHERE pid = $1
        RETURNING balance, version
    `, [ pid, amount ])
    const row = rs.rows?.[ 0 ]
    return row ? { balance: +row.balance, version: row.version } : void 0
}
