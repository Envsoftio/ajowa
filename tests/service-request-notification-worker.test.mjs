import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { settleSequentially } from '../server/utils/settle-sequentially.ts'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('ticket mutations enqueue sequentially and delegate delivery to a background worker', async () => {
  const source = await readSource('../server/utils/service-requests.ts')

  assert.match(source, /settleSequentially/)
  assert.doesNotMatch(source, /Promise\.allSettled\(\[/)
  assert.match(
    source,
    /client\.release\(\)[\s\S]*invokeServiceRequestNotificationWorkers/,
  )
  assert.doesNotMatch(source, /dispatchNotificationJobs/)
})

test('sequential settling never overlaps database-client tasks and preserves failures', async () => {
  let activeTasks = 0
  let maximumActiveTasks = 0
  const completed = []
  const task =
    (value, shouldReject = false) =>
    async () => {
      activeTasks += 1
      maximumActiveTasks = Math.max(maximumActiveTasks, activeTasks)
      await new Promise((resolve) => setTimeout(resolve, 2))
      activeTasks -= 1
      completed.push(value)

      if (shouldReject) throw new Error(value)
      return value
    }

  const results = await settleSequentially([
    task('resident'),
    task('manager', true),
    task('service'),
  ])

  assert.equal(maximumActiveTasks, 1)
  assert.deepEqual(completed, ['resident', 'manager', 'service'])
  assert.deepEqual(
    results.map((result) => result.status),
    ['fulfilled', 'rejected', 'fulfilled'],
  )
})

test('service request notification worker is isolated, authenticated, and recoverable', async () => {
  const dispatchSource = await readSource(
    '../server/utils/service-request-notification-dispatch.ts',
  )
  const workerSource = await readSource(
    '../netlify/functions/service-request-notifications.ts',
  )
  const wakeSource = await readSource(
    '../netlify/functions/service-request-notifications-wake.ts',
  )

  assert.match(dispatchSource, /source_table = 'service_requests'/)
  assert.match(dispatchSource, /event_key = \$2/)
  assert.match(dispatchSource, /client\.release\(\)/)
  assert.match(
    workerSource,
    /SERVICE_REQUEST_NOTIFICATION_WORKER_SECRET_HEADER/,
  )
  assert.match(workerSource, /background: true/)
  assert.match(workerSource, /continuationQueued/)
  assert.match(wakeSource, /schedule: '\*\/5 \* \* \* \*'/)
})
