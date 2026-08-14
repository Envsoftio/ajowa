import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('admin notification processing delegates delivery to a background worker', async () => {
  const endpointSource = await readSource('../server/api/admin/notifications/process.post.ts')
  const dispatchSource = await readSource('../server/utils/notification-worker-dispatch.ts')
  const workerSource = await readSource('../netlify/functions/notifications.ts')
  const wakeSource = await readSource('../netlify/functions/notifications-wake.ts')
  const pageSource = await readSource('../pages/admin/notifications/index.vue')

  assert.match(endpointSource, /invokeNotificationWorker/)
  assert.doesNotMatch(endpointSource, /dispatchNotificationJobs/)
  assert.match(endpointSource, /workerStarted/)

  assert.match(dispatchSource, /NOTIFICATION_WORKER_BATCH_SIZE = 5/)
  assert.match(dispatchSource, /dispatchNotificationJobs/)
  assert.match(dispatchSource, /client\.release\(\)/)

  assert.match(workerSource, /background: true/)
  assert.match(workerSource, /continuationQueued/)
  assert.match(wakeSource, /schedule: '\*\/5 \* \* \* \*'/)

  assert.doesNotMatch(pageSource, /maxProcessQueueBatches/)
  assert.doesNotMatch(pageSource, /for \(let index = 0/)
  assert.match(pageSource, /Background delivery started/)
})
