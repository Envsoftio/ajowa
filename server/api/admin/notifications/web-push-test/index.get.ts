import { z } from 'zod'
import { createApiSuccess, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getQuerySafe } from '~/server/utils/master-data'
import { getWebPushDebugDiagnostics } from '~/server/utils/web-push-debug'

const querySchema = z.object({
  flatId: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const query = validateInput(querySchema, getQuerySafe(event))
  const client = await getDatabasePool().connect()

  try {
    const diagnostics = await getWebPushDebugDiagnostics(client, {
      societyId: authMe.user.societyId,
      flatId: query.flatId,
    })

    return createApiSuccess(event, diagnostics)
  } finally {
    client.release()
  }
})
