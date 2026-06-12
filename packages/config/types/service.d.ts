export interface ServiceDescription {
    service: string
    role: string
    owns: readonly string[]
}

export function bootService(description: ServiceDescription): void
export function isMain(importMetaUrl: string): boolean
