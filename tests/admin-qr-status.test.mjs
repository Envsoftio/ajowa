import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('admin QR status check stays read-only and does not expose QR credentials', async () => {
  const [source, adminPage] = await Promise.all([
    readSource('../server/api/admin/residents/[id]/qr-status.get.ts'),
    readSource('../pages/admin/residents/[id].vue'),
  ])

  assert.match(source, /requireRole\(event, \['ADMIN'\]\)/)
  assert.match(source, /u\.society_id = \$2/)
  assert.match(source, /access_token\.society_id = \$2/)
  assert.match(source, /cache-control', 'private, no-store'/)

  assert.doesNotMatch(source, /ensureQrForAccess/)
  assert.doesNotMatch(source, /recomputeUserAccess/)
  assert.doesNotMatch(source, /revokeActiveQr/)
  assert.doesNotMatch(source, /token_hash/)
  assert.doesNotMatch(source, /qr_payload/)
  assert.doesNotMatch(source, /qr_image_path/)
  assert.doesNotMatch(source, /\b(insert|update|delete)\s+(into|from|[a-z_])/i)

  assert.match(adminPage, /authStore\.me\?\.user\.role === 'ADMIN'/)
  assert.match(adminPage, /v-if="canCheckQrStatus"/)
  assert.doesNotMatch(adminPage, /\/api\/qr\/image\/\$\{qrStatus/)
})

test('flat-owner QR generation and image ownership checks remain in place', async () => {
  const [ownerEndpoint, imageEndpoint] = await Promise.all([
    readSource('../server/api/qr/my-qr.get.ts'),
    readSource('../server/api/qr/image/[id].get.ts'),
  ])

  assert.match(ownerEndpoint, /ensureQrForAccess\(userId, billingPeriodId\)/)
  assert.match(imageEndpoint, /at\.user_id = \$2/)
  assert.match(imageEndpoint, /at\.society_id = \$3/)
})
