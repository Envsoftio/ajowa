import process from 'node:process'
import { Pool, type PoolConfig, type QueryResultRow } from 'pg'
import { getValidatedRuntimeConfig } from './env'

let databasePool: Pool | null = null

const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
])
const SSL_MODES = new Set([
  'allow',
  'prefer',
  'require',
  'verify-ca',
  'verify-full',
])

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const isNetlifyRuntime = () => process.env.NETLIFY === 'true'

const getPoolRuntimeConfig = (): Pick<
  PoolConfig,
  'allowExitOnIdle' | 'connectionTimeoutMillis' | 'idleTimeoutMillis' | 'max'
> => ({
  allowExitOnIdle: isNetlifyRuntime(),
  connectionTimeoutMillis: parsePositiveInteger(
    process.env.DB_CONNECTION_TIMEOUT_MS,
    10000,
  ),
  idleTimeoutMillis: parsePositiveInteger(
    process.env.DB_IDLE_TIMEOUT_MS,
    10000,
  ),
  max: parsePositiveInteger(
    process.env.DB_POOL_MAX,
    isNetlifyRuntime() ? 1 : 10,
  ),
})

const withPoolRuntimeConfig = (config: PoolConfig): PoolConfig => ({
  ...config,
  ...getPoolRuntimeConfig(),
})

const warnIfNetlifyUsesSupabaseDirectHost = (url: URL) => {
  if (!isNetlifyRuntime()) {
    return
  }

  if (!/^db\.[^.]+\.supabase\.co$/.test(url.hostname)) {
    return
  }

  console.warn(
    JSON.stringify({
      level: 'warn',
      message:
        'DATABASE_URL uses a Supabase direct database host on Netlify. Use the Supabase Shared Pooler transaction URL on port 6543 unless the project has the IPv4 add-on.',
      host: url.hostname,
      port: url.port || '5432',
    }),
  )
}

const createDatabasePoolConfig = (databaseUrl: string): PoolConfig => {
  try {
    const url = new URL(databaseUrl)
    const host = url.hostname.replace(/^\[|\]$/g, '')

    if (LOCAL_DATABASE_HOSTS.has(host)) {
      url.searchParams.set('sslmode', 'disable')

      return {
        connectionString: url.toString(),
        ssl: false,
        ...getPoolRuntimeConfig(),
      }
    }

    warnIfNetlifyUsesSupabaseDirectHost(url)

    const sslMode = url.searchParams.get('sslmode')?.toLowerCase()

    if (!sslMode || !SSL_MODES.has(sslMode)) {
      url.searchParams.set('sslmode', 'require')
    }

    if (SSL_MODES.has(url.searchParams.get('sslmode')?.toLowerCase() ?? '')) {
      url.searchParams.set('uselibpqcompat', 'true')
      return withPoolRuntimeConfig({ connectionString: url.toString() })
    }
  } catch {
    return withPoolRuntimeConfig({ connectionString: databaseUrl })
  }

  return withPoolRuntimeConfig({ connectionString: databaseUrl })
}

export const getDatabasePool = () => {
  if (databasePool) {
    return databasePool
  }

  const runtimeConfig = getValidatedRuntimeConfig()

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
