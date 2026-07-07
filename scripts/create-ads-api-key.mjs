import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import pg from 'pg'

const { Pool } = pg
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

if (typeof process.loadEnvFile === 'function') {
  if (existsSync('.env')) {
    process.loadEnvFile('.env')
  }

  if (existsSync('.env.local')) {
    process.loadEnvFile('.env.local')
  }
}

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
const societyCode =
  process.env.ADS_API_KEY_SOCIETY_CODE ||
  process.env.SOCIETY_CODE ||
  process.env.NUXT_PUBLIC_SOCIETY_CODE ||
  'AJOWA'
const keyName = process.env.ADS_API_KEY_NAME || 'Ads management key'
const expiresAt = process.env.ADS_API_KEY_EXPIRES_AT || null
const token =
  process.env.ADS_API_TOKEN ||
  `ajowa_ads_${randomBytes(32).toString('base64url')}`
const keyHash = `sha256:${createHash('sha256').update(token).digest('hex')}`

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL or SUPABASE_DB_URL is required before creating an ads API key.',
  )
}

if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
  throw new Error(
    'ADS_API_KEY_EXPIRES_AT must be a valid date/time when provided.',
  )
}

const createPoolConfig = (urlValue) => {
  try {
    const url = new URL(urlValue)
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

    if (url.searchParams.get('sslmode') !== 'verify-full') {
      url.searchParams.set('uselibpqcompat', 'true')
    }

    return {
      connectionString: url.toString(),
    }
  } catch {
    return {
      connectionString: urlValue,
    }
  }
}

const pool = new Pool({
  ...createPoolConfig(databaseUrl),
})

const run = async () => {
  const client = await pool.connect()

  try {
    await client.query('begin')

    const societyResult = await client.query(
      `
        select id
        from society_profile
        where code = $1
        limit 1
      `,
      [societyCode],
    )
    const societyId = societyResult.rows[0]?.id

    if (!societyId) {
      throw new Error(`No society_profile found for code "${societyCode}".`)
    }

    const keyResult = await client.query(
      `
        insert into ad_api_keys (society_id, name, key_hash, scopes, expires_at)
        values ($1, $2, $3, array['ads.manage']::text[], $4)
        on conflict (key_hash) do update
          set name = excluded.name,
              scopes = excluded.scopes,
              expires_at = excluded.expires_at,
              revoked_at = null
        returning id
      `,
      [societyId, keyName, keyHash, expiresAt],
    )

    await client.query('commit')

    console.log(
      `Created ads API key ${keyResult.rows[0]?.id} for society ${societyCode}.`,
    )
    console.log('Raw token, shown once:')
    console.log(token)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
