export interface JWTClaim {
    [claim: string]: unknown
}

export interface JWTPayload extends JWTClaim {
    iat: number
    exp: number
}

export interface Auth {
    sign(payload: JWTClaim): string
    verify(token: string): JWTPayload
}

export function sign(payload: JWTClaim, secret: string, ttl?: string | number): string
export function verify(token: string, secret: string): JWTPayload
export function create(secret: string, ttl?: string | number): Auth
