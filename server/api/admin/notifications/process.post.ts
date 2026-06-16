import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { dispatchNotificationJobs } from '~/server/utils/notifications'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['ADMIN', 'MANAGER'])
  const client = await getDatabasePool().connect()

  try {
    const result = await dispatchNotificationJobs(client, { limit: 50 })
    return createApiSuccess(event, result)
  } finally {
    client.release()
  }
})
