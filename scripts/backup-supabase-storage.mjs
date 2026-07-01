#!/usr/bin/env node
import { createWriteStream } from 'node:fs'
import {
  access,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..')
const DEFAULT_BACKUP_ROOT = path.join(homedir(), 'ajowa-storage-backups')
const DEFAULT_CONCURRENCY = 4
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

const usage = () => {
  console.log(`Usage:
  npm run backup:storage
  node scripts/backup-supabase-storage.mjs [options]

Options:
  -b, --bucket <bucket>      Back up only this bucket. Can be repeated or comma separated.
      --concurrency <n>      Parallel object downloads. Defaults to STORAGE_BACKUP_CONCURRENCY or 4.
      --dry-run              Read metadata and print what would be copied without writing files.
  -h, --help                 Show this help.

Environment:
  ENV_FILE=...                                  Env file to load. Defaults to ./.env.
  STORAGE_BACKUP_DATABASE_URL=...              DB URL for storage metadata.
  PROD_BACKUP_DATABASE_URL=...                 Fallback DB URL.
  DATABASE_URL=...                             Fallback DB URL.
  STORAGE_BACKUP_SUPABASE_URL=...              Supabase project URL.
  NUXT_PUBLIC_SUPABASE_URL=...                 Fallback Supabase project URL.
  SUPABASE_URL=...                             Fallback Supabase project URL.
  STORAGE_BACKUP_SUPABASE_SERVICE_ROLE_KEY=... Service key for Storage downloads.
  SUPABASE_SERVICE_ROLE_KEY=...                Fallback service key.
  STORAGE_BACKUP_ROOT=...                      Backup parent directory. Defaults to ~/ajowa-storage-backups.
  STORAGE_BACKUP_DIR=...                       Exact backup directory. Defaults to <root>/<utc-timestamp>.
  STORAGE_BACKUP_BUCKETS=...                   Optional comma separated bucket allow-list.
  STORAGE_BACKUP_CONCURRENCY=...               Optional download concurrency.

The script creates:
  <backup-dir>/storage-buckets.json
  <backup-dir>/storage-policies.json
  <backup-dir>/storage-objects-metadata.jsonl
  <backup-dir>/storage-objects-manifest.jsonl
  <backup-dir>/manifest.json
  <backup-dir>/objects/<bucket>/<object path>`)
}

const parseArgs = (argv) => {
  const options = {
    buckets: [],
    concurrency: undefined,
    dryRun: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '-h' || arg === '--help') {
      options.help = true
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '-b' || arg === '--bucket') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error(`${arg} requires a bucket name.`)
      }
      options.buckets.push(...parseList(value))
      index += 1
    } else if (arg.startsWith('--bucket=')) {
      options.buckets.push(...parseList(arg.slice('--bucket='.length)))
    } else if (arg === '--concurrency') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--concurrency requires a number.')
      }
      options.concurrency = parsePositiveInteger(value, '--concurrency')
      index += 1
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = parsePositiveInteger(
        arg.slice('--concurrency='.length),
        '--concurrency',
      )
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

const parsePositiveInteger = (value, label) => {
  const parsed = Number.parseInt(value, 10)

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`)
  }

  return parsed
}

const parseList = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const pathExists = async (filePath) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const loadEnvFile = async (envFile) => {
  if (!(await pathExists(envFile))) {
    return false
  }

  const contents = await readFile(envFile, 'utf8')

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) {
      continue
    }

    const normalizedLine = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line
    const separatorIndex = normalizedLine.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = normalizedLine.slice(0, separatorIndex).trim()
    const rawValue = normalizedLine.slice(separatorIndex + 1).trim()

    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
      process.env[key] !== undefined
    ) {
      continue
    }

    process.env[key] = parseEnvValue(rawValue)
  }

  return true
}

const parseEnvValue = (value) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const unquoted = value.slice(1, -1)
    return value.startsWith('"')
      ? unquoted
          .replaceAll('\\n', '\n')
          .replaceAll('\\r', '\r')
          .replaceAll('\\t', '\t')
          .replaceAll('\\"', '"')
          .replaceAll('\\\\', '\\')
      : unquoted
  }

  const commentIndex = value.search(/\s+#/)
  return (commentIndex === -1 ? value : value.slice(0, commentIndex)).trim()
}

const expandHome = (value) => {
  if (value === '~') {
    return homedir()
  }

  if (value.startsWith('~/')) {
    return path.join(homedir(), value.slice(2))
  }

  return value
}

const createUtcStamp = () =>
  new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')

const requireEnv = (name, value, message) => {
  if (!value) {
    throw new Error(message ?? `${name} is required.`)
  }

  return value
}

const getEnvUrlCandidate = (name) => {
  const value = process.env[name]

  if (!value) {
    return null
  }

  try {
    if (value.includes('<') || value.includes('>')) {
      throw new Error('replace placeholder values such as <project-ref>')
    }

    const url = new URL(value)
    return {
      name,
      url,
      value,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Invalid URL'
    console.warn(`Warning: ignoring invalid ${name}: ${reason}.`)
    return null
  }
}

const resolveEnvUrl = (names, message) => {
  for (const name of names) {
    const candidate = getEnvUrlCandidate(name)

    if (candidate) {
      return candidate
    }
  }

  throw new Error(message)
}

const resolveConfig = async (options) => {
  const envFile = path.resolve(
    expandHome(process.env.ENV_FILE ?? path.join(PROJECT_ROOT, '.env')),
  )
  const loadedEnv = await loadEnvFile(envFile)
  const backupRoot = path.resolve(
    expandHome(process.env.STORAGE_BACKUP_ROOT ?? DEFAULT_BACKUP_ROOT),
  )
  const backupDir = process.env.STORAGE_BACKUP_DIR
    ? path.resolve(expandHome(process.env.STORAGE_BACKUP_DIR))
    : path.join(backupRoot, createUtcStamp())
  const envBuckets = parseList(process.env.STORAGE_BACKUP_BUCKETS ?? '')
  const requestedBuckets = [...new Set([...envBuckets, ...options.buckets])]
  const concurrency =
    options.concurrency ??
    (process.env.STORAGE_BACKUP_CONCURRENCY
      ? parsePositiveInteger(
          process.env.STORAGE_BACKUP_CONCURRENCY,
          'STORAGE_BACKUP_CONCURRENCY',
        )
      : DEFAULT_CONCURRENCY)
  const databaseUrl = resolveEnvUrl(
    [
      'STORAGE_BACKUP_DATABASE_URL',
      'PROD_BACKUP_DATABASE_URL',
      'DATABASE_URL',
      'SUPABASE_DB_URL',
    ],
    'A valid STORAGE_BACKUP_DATABASE_URL, PROD_BACKUP_DATABASE_URL, DATABASE_URL, or SUPABASE_DB_URL is required.',
  )
  const supabaseUrl = resolveEnvUrl(
    ['STORAGE_BACKUP_SUPABASE_URL', 'NUXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'],
    'A valid STORAGE_BACKUP_SUPABASE_URL, NUXT_PUBLIC_SUPABASE_URL, or SUPABASE_URL is required.',
  )

  return {
    backupDir,
    backupRoot,
    concurrency,
    databaseUrl: databaseUrl.value,
    databaseUrlEnvName: databaseUrl.name,
    dryRun: options.dryRun,
    envFile,
    loadedEnv,
    requestedBuckets,
    serviceRoleKey: requireEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
      process.env.STORAGE_BACKUP_SUPABASE_SERVICE_ROLE_KEY ??
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      'STORAGE_BACKUP_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY is required.',
    ),
    supabaseUrl: supabaseUrl.value.replace(/\/+$/, ''),
    supabaseUrlEnvName: supabaseUrl.name,
  }
}

const warnForRiskyConfig = (config) => {
  if (!config.loadedEnv) {
    console.warn(`Warning: env file was not found: ${config.envFile}`)
  }

  if (
    config.databaseUrl.includes('localhost') ||
    config.databaseUrl.includes('127.0.0.1')
  ) {
    console.warn('Warning: backup database URL looks local, not production.')
  }

  if (config.databaseUrl.includes('pooler.supabase.com:6543')) {
    console.warn(
      'Warning: database URL uses the Supabase transaction pooler on 6543. For large metadata reads, prefer a direct 5432 URL when available.',
    )
  }

  if (
    config.supabaseUrl.includes('localhost') ||
    config.supabaseUrl.includes('127.0.0.1')
  ) {
    console.warn('Warning: Supabase URL looks local, not production.')
  }
}

const writeJson = async (filePath, value) => {
  await writeFile(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`)
  await rename(`${filePath}.tmp`, filePath)
}

const writeJsonLines = async (filePath, values) => {
  await writeFile(
    `${filePath}.tmp`,
    values.map((value) => JSON.stringify(value)).join('\n') +
      (values.length > 0 ? '\n' : ''),
  )
  await rename(`${filePath}.tmp`, filePath)
}

const createDatabasePoolConfig = (databaseUrl) => {
  const url = new URL(databaseUrl)
  const host = url.hostname.replace(/^\[|\]$/g, '')

  if (LOCAL_DATABASE_HOSTS.has(host)) {
    url.searchParams.set('sslmode', 'disable')

    return {
      connectionString: url.toString(),
      max: 1,
      ssl: false,
    }
  }

  const sslMode = url.searchParams.get('sslmode')?.toLowerCase()

  if (!sslMode || !SSL_MODES.has(sslMode)) {
    url.searchParams.set('sslmode', 'require')
  }

  if (SSL_MODES.has(url.searchParams.get('sslmode')?.toLowerCase() ?? '')) {
    url.searchParams.set('uselibpqcompat', 'true')
  }

  return {
    connectionString: url.toString(),
    max: 1,
  }
}

const getStorageMetadata = async (databaseUrl, requestedBuckets) => {
  const pool = new Pool(createDatabasePoolConfig(databaseUrl))

  try {
    const bucketResult = await pool.query(
      'select to_jsonb(b) as bucket from storage.buckets b order by b.id',
    )
    const buckets = bucketResult.rows.map((row) => row.bucket)
    const requestedBucketSet = new Set(requestedBuckets)
    const selectedBuckets =
      requestedBucketSet.size === 0
        ? buckets
        : buckets.filter(
            (bucket) =>
              requestedBucketSet.has(bucket.id) ||
              requestedBucketSet.has(bucket.name),
          )

    if (requestedBucketSet.size > 0) {
      const foundNames = new Set(
        selectedBuckets.flatMap((bucket) =>
          [bucket.id, bucket.name].filter(Boolean),
        ),
      )
      const missingBuckets = [...requestedBucketSet].filter(
        (bucket) => !foundNames.has(bucket),
      )

      if (missingBuckets.length > 0) {
        throw new Error(
          `Unknown storage bucket(s): ${missingBuckets.join(', ')}`,
        )
      }
    }

    const bucketIds = selectedBuckets.map((bucket) => bucket.id)
    const objectResult =
      bucketIds.length === 0
        ? { rows: [] }
        : await pool.query(
            `select to_jsonb(o) as object
             from storage.objects o
             where o.bucket_id = any($1::text[])
             order by o.bucket_id, o.name`,
            [bucketIds],
          )
    const policyResult = await pool.query(
      `select to_jsonb(p) as policy
       from pg_policies p
       where p.schemaname = 'storage'
       order by p.tablename, p.policyname`,
    )

    return {
      buckets: selectedBuckets,
      objects: objectResult.rows.map((row) => row.object),
      policies: policyResult.rows.map((row) => row.policy),
      totalBucketCount: buckets.length,
    }
  } finally {
    await pool.end()
  }
}

const encodeStoragePath = (objectName) =>
  objectName
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join(path.sep)

const getLocalObjectPath = (backupDir, object) => {
  const encodedObjectPath = encodeStoragePath(object.name)

  if (!encodedObjectPath) {
    throw new Error('Storage object name is empty.')
  }

  return path.join(
    backupDir,
    'objects',
    encodeURIComponent(object.bucket_id),
    encodedObjectPath,
  )
}

const buildObjectUrl = (supabaseUrl, object) => {
  const encodedBucket = encodeURIComponent(object.bucket_id)
  const encodedName = object.name.split('/').map(encodeURIComponent).join('/')
  return `${supabaseUrl}/storage/v1/object/${encodedBucket}/${encodedName}`
}

const truncate = (value, maxLength) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`

const downloadObject = async (config, object, outputPath) => {
  if (await pathExists(outputPath)) {
    const existingStats = await stat(outputPath)
    return {
      bytesWritten: existingStats.size,
      status: 'skipped_existing',
    }
  }

  await mkdir(path.dirname(outputPath), { recursive: true })

  const tempPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`
  const response = await fetch(buildObjectUrl(config.supabaseUrl, object), {
    headers: {
      accept: 'application/octet-stream',
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `HTTP ${response.status} ${response.statusText}${
        body ? `: ${truncate(body, 300)}` : ''
      }`,
    )
  }

  try {
    if (response.body) {
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(tempPath, { flags: 'wx' }),
      )
    } else {
      const buffer = Buffer.from(await response.arrayBuffer())
      await writeFile(tempPath, buffer, { flag: 'wx' })
    }

    await rename(tempPath, outputPath)
  } catch (error) {
    await unlink(tempPath).catch(() => {})
    throw error
  }

  const stats = await stat(outputPath)
  return {
    bytesWritten: stats.size,
    status: 'downloaded',
  }
}

const createObjectManifestEntry = (object, localPath, extra) => ({
  bucketId: object.bucket_id,
  bytesWritten: extra.bytesWritten ?? 0,
  error: extra.error ?? null,
  localPath,
  metadataSize: object.metadata?.size ?? null,
  name: object.name,
  status: extra.status,
  updatedAt: object.updated_at ?? null,
  version: object.version ?? null,
})

const runWithConcurrency = async (items, concurrency, worker) => {
  const results = new Array(items.length)
  let nextIndex = 0

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await worker(items[currentIndex], currentIndex)
      }
    },
  )

  await Promise.all(workers)
  return results
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    usage()
    return
  }

  const config = await resolveConfig(options)
  warnForRiskyConfig(config)

  console.log(`Loading env from: ${config.envFile}`)
  console.log(`Backup directory: ${config.backupDir}`)
  console.log(`Download concurrency: ${config.concurrency}`)
  console.log(`Database URL source: ${config.databaseUrlEnvName}`)
  console.log(`Supabase URL source: ${config.supabaseUrlEnvName}`)

  const startedAt = new Date().toISOString()
  const { buckets, objects, policies, totalBucketCount } =
    await getStorageMetadata(config.databaseUrl, config.requestedBuckets)

  console.log(
    `Found ${objects.length} object(s) across ${buckets.length}/${totalBucketCount} bucket(s).`,
  )

  if (config.dryRun) {
    console.log('Dry run only. No files were written.')
    return
  }

  await mkdir(config.backupDir, { recursive: true })
  await writeJson(path.join(config.backupDir, 'storage-buckets.json'), buckets)
  await writeJson(
    path.join(config.backupDir, 'storage-policies.json'),
    policies,
  )
  await writeJsonLines(
    path.join(config.backupDir, 'storage-objects-metadata.jsonl'),
    objects,
  )

  let downloadedCount = 0
  let failedCount = 0
  let skippedExistingCount = 0
  let bytesWritten = 0

  const objectManifest = await runWithConcurrency(
    objects,
    config.concurrency,
    async (object) => {
      const localPath = getLocalObjectPath(config.backupDir, object)
      const relativeLocalPath = path.relative(config.backupDir, localPath)

      try {
        const result = await downloadObject(config, object, localPath)

        if (result.status === 'downloaded') {
          downloadedCount += 1
        } else if (result.status === 'skipped_existing') {
          skippedExistingCount += 1
        }

        bytesWritten += result.bytesWritten

        return createObjectManifestEntry(object, relativeLocalPath, result)
      } catch (error) {
        failedCount += 1

        return createObjectManifestEntry(object, relativeLocalPath, {
          error: error instanceof Error ? error.message : String(error),
          status: 'failed',
        })
      }
    },
  )

  await writeJsonLines(
    path.join(config.backupDir, 'storage-objects-manifest.jsonl'),
    objectManifest,
  )

  const finishedAt = new Date().toISOString()
  const manifest = {
    backupDir: config.backupDir,
    backupRoot: config.backupRoot,
    bucketCount: buckets.length,
    buckets: buckets.map((bucket) => bucket.id),
    bytesWritten,
    downloadedCount,
    failedCount,
    finishedAt,
    objectCount: objects.length,
    policyCount: policies.length,
    skippedExistingCount,
    startedAt,
    supabaseUrl: config.supabaseUrl,
  }

  await writeJson(path.join(config.backupDir, 'manifest.json'), manifest)

  console.log()
  console.log('Storage backup complete.')
  console.log(`Downloaded objects: ${downloadedCount}`)
  console.log(`Skipped existing: ${skippedExistingCount}`)
  console.log(`Failed objects: ${failedCount}`)
  console.log(`Bytes written: ${bytesWritten}`)
  console.log(`Manifest: ${path.join(config.backupDir, 'manifest.json')}`)

  if (failedCount > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
