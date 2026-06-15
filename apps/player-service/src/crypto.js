import Crypto        from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(Crypto.scrypt)

export async function hash(pass) {
    const salt = Crypto.randomBytes(16).toString('hex')
    const buf  = await scrypt(pass, salt, 64)
    return `${ salt }:${ buf.toString('hex') }`
}

export async function verify(pass, stored) {
    const [ salt, hex ] = stored.split(':')
    const buf = await scrypt(pass, salt, 64)
    return buf.toString('hex') === hex
}

export default { hash, verify }
