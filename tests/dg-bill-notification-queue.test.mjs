import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('queues DG Set bill emails from due creation through notification jobs', async () => {
  const source = await readSource('../server/api/admin/billing/dues/index.post.ts')

  assert.match(source, /startPhase\('dg_bill_notification_enqueue'\)/)
  assert.match(source, /eventKey: 'maintenance_due\.bill'/)
  assert.match(source, /channels: \['EMAIL'\]/)
  assert.match(source, /recipientRelationshipTypes: \['OWNER'\]/)
  assert.match(source, /invokeBillEmailNotificationWorker\(authMe\.user\.societyId\)/)
  assert.doesNotMatch(source, /startPhase\('created_notification_skip'\)/)
})

test('reuses the bill notification queue worker from manual bill sends', async () => {
  const source = await readSource('../server/api/admin/billing/dues/send-bills.post.ts')

  assert.match(source, /invokeBillEmailNotificationWorker/)
  assert.doesNotMatch(source, /drainQueuedBillEmails\(societyId\)/)
})
