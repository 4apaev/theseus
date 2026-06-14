import type { Pool } from 'pg'

export default function migrate(pool: Pool, dir?: string): Promise<void>
