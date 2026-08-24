import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('family photo uploads reuse the active transaction database client', async () => {
  const source = await readSource('../server/utils/family-members.ts')

  assert.match(
    source,
    /replacePrivateFile\(\{[\s\S]*?\}, \{ dbClient: client \}\)/,
  )
  assert.match(source, /uploadPrivateFile\(fileInput, \{ dbClient: client \}\)/)
})

test('private file replacement can reuse a caller database client', async () => {
  const source = await readSource('../server/utils/storage.ts')

  assert.match(
    source,
    /replacePrivateFile = async \([\s\S]*?options\?: \{ dbClient\?: StorageQueryClient \}/,
  )
  assert.match(source, /const queryable = dbClient \?\? getDatabasePool\(\)/)
})

test('family photo lookup does not replace unrelated resident documents', async () => {
  const source = await readSource('../server/utils/family-members.ts')
  const lookup = source.slice(
    source.indexOf('const fileResult ='),
    source.indexOf('const checksum ='),
  )

  assert.doesNotMatch(lookup, /related_record_type = 'users'/)
  assert.match(lookup, /fo\.storage_object_key = u\.profile_image_path/)
})
