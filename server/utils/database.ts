import { Pool, type PoolConfig, type QueryResultRow } from 'pg'
import { getValidatedRuntimeConfig } from './env'

let databasePool: Pool | null = null

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])
const SSL_MODES = new Set(['allow', 'prefer', 'require', 'verify-ca', 'verify-full'])

const createDatabasePoolConfig = (databaseUrl: string): PoolConfig => {
  try {
    const url = new URL(databaseUrl)
    const host = url.hostname.replace(/^\[|\]$/g, '')

    if (LOCAL_DATABASE_HOSTS.has(host)) {
      url.searchParams.set('sslmode', 'disable')

      return {
        connectionString: url.toString(),
        ssl: false,
      }
    }

    const sslMode = url.searchParams.get('sslmode')?.toLowerCase()

    if (!sslMode || !SSL_MODES.has(sslMode)) {
      url.searchParams.set('sslmode', 'require')
    }

    if (SSL_MODES.has(url.searchParams.get('sslmode')?.toLowerCase() ?? '')) {
      url.searchParams.set('uselibpqcompat', 'true')
      return { connectionString: url.toString() }
    }
  } catch {
    return { connectionString: databaseUrl }
  }

  return { connectionString: databaseUrl }
}

export const getDatabasePool = () => {
  if (databasePool) {
    return databasePool
  }

  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())

  databasePool = new Pool(createDatabasePoolConfig(runtimeConfig.databaseUrl))

  return databasePool
}

export const queryRows = async <TRow extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) => {
  const pool = getDatabasePool()
  return pool.query<TRow>(text, values)
}
