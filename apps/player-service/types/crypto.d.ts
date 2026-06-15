export function hash(pass: string): Promise<string>
export function verify(pass: string, stored: string): Promise<boolean>

declare const Crypt: {
    hash: typeof hash
    verify: typeof verify
    bytes(n: number): Buffer
    readonly guid: string
}
export default Crypt
