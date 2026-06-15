import { Pool, type QueryResultRow } from 'pg'
import { getValidatedRuntimeConfig } from './env'

let databasePool: Pool | null = null

export const getDatabasePool = () => {
  if (databasePool) {
    return databasePool
  }

  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())

  databasePool = new Pool({
    connectionString: runtimeConfig.databaseUrl,
  })

  return databasePool
}

export const queryRows = async <TRow extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) => {
  const pool = getDatabasePool()
  return pool.query<TRow>(text, values)
}
